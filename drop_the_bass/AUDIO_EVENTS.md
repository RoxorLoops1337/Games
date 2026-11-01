# Drop The Bass: audio events for the battle UI

Everything here is `import { AudioFx } from './audio.js'`. All calls are safe no-ops with no AudioContext, muted, or suspended.
Call `AudioFx.init()` / `resume()` from a user gesture first. Sfx are rate-limited per name inside audio.js, so call sites can fire freely.

## Music

| Call | When |
|---|---|
| `AudioFx.musicStart('world_garage')` | Entering a battle. Ids: `world_garage world_busk world_club world_festival world_arena`. Same id twice is a no-op (state is kept). |
| `AudioFx.musicStart('boss')` | Boss wave, if you want the boss track instead of (or on top of) the boss layer. |
| `AudioFx.musicStart('victory')` / `'defeat'` | Results screens. A new track resets the adaptive state and opens the tension filter. |
| `AudioFx.musicStart('title' / 'hub' / 'cutscene_warm' / 'cutscene_dark')` | Title, hub, cutscenes. |
| `AudioFx.musicStop(sec)` | Leaving to silence. |

Each world track has its own bpm, key, drum style, bass line, chord colour and lead timbre (`AudioFx.trackInfo(id)` returns the summary).

### setMusicState (call 2 to 5 times a second from the battle view)

```js
AudioFx.setMusicState({ wave, wavesTotal, hypePct, bossAlive, stageHpPct, enemiesOnField })
```

All fields optional. Call AFTER `musicStart` for the battle track.

| Field | Meaning |
|---|---|
| `wave`, `wavesTotal` | Current wave (1 based) and total (20 in Story). More layers as the run progresses. |
| `hypePct` | Hype bar 0..1 (a value above 1 is read as 0..100). Adds intensity. |
| `bossAlive` | true while a boss is on the field: intensity is at least 0.9 and a boss layer (sub drone, tom hits) fades in. |
| `stageHpPct` | Stage HP 0..1. Below 0.35 the music is low-passed (tense muffled sound) and a dissonant drone joins. Heartbeat tempo follows it. |
| `enemiesOnField` | Count, saturates at 25. Adds intensity. |

Returns `{ intensity, boss, low }` for debugging. Intensity glides (about 1 s), the filter is throttled and only re-automated when
the state meaningfully changes, so spamming it every frame is also safe. `musicIntensity(v)` still works and snaps faster.

Layer thresholds (intensity): kick 0.05, hats 0.15, bass 0.2, snare 0.25, chords 0.35, arp 0.55, lead per track (0.7 to 0.8 on worlds).

### Beat sync

`AudioFx.beatInfo()` returns `null` or `{ bpm, beat, phase, t, beatDur, toNext, sinceLast, latency }`.
`phase` 0..1 is corrected for output latency so it matches what the player hears. A deploy is on the beat when
`phase < 0.12 || phase > 0.88` (or `Math.min(sinceLast, toNext) < 0.08`). `onBeat(fn)` fires on the audio clock (slightly earlier than heard,
use it for visual pulses). Each beat boundary has an exact note on every bar downbeat (`beat % 4 === 0`), verified by the test suite.

## Heartbeat

`AudioFx.heartbeat(true)` starts a lub-dub loop, `heartbeat(false)` stops it. Equivalent: `play('stage_low')` starts it (plus a sting),
`play('stage_low', { off: true })` stops it, `play('stage_low', { loop: false })` is the sting only. It works with or without music,
speeds up as `stageHpPct` falls (via `setMusicState`). Typical wiring: start when stage hp <= 0.3, stop when it recovers above 0.4, on win/lose, on pause, and on leaving the battle.

## New sfx (the drop pack)

| Name | Trigger | Notes |
|---|---|---|
| `drop_big` | Hype bar full, or a turret reaches merge level 7 for the first time in a run | ~2.3 s: riser 1.4 s, a silent beat, sub hit with crash at +1.85 s. Ducks the music itself. Limit 1 per 2.5 s. Do not stack with `merge_7`/`hype_full` on the same frame, pick one. |
| `hype_full` | Hype bar reaches 100% when you want the short version (before the Remix pick opens) | Rising sweep and arpeggio. |
| `synergy` | A turret synergy or adjacency buff becomes active | Two note chime. |
| `reroll_drop` | Player rerolls the pool / the drop slot | Quick shuffle. |
| `wave_preview` | The next wave preview banner or tooltip appears | Soft whoosh tick. |
| `perfect_beat` | Deploy accepted on the beat (discount applied) | Tight click-snap. Fire alongside `deploy`. |
| `boss_hit` | Boss takes a damage tick worth marking (not every projectile) | Heavy thud, 1 per 120 ms. Yields to the voice cap. |
| `merge_7` | Merge produces a level 7 turret | Celebration. Use instead of `merge_big` for level 7. |
| `combo_milestone` | Kill combo hits 10, 25, 50, 100 | Pass `{ pitch }` rising with the combo, e.g. 1, 1.25, 1.5, 2. |
| `stage_low` | Stage hp crosses below the danger line | See Heartbeat. |
| `ui_pop` | Small UI pops: tooltips, chips, badge counters | Bubble pop. |

Existing sfx are unchanged. Options for every `play(name, o)`: `pan -1..1`, `vol 0..1.5`, `pitch` ratio (0.25 to 4), `at` seconds of delay.

## Example call sites

```js
// battle enter
AudioFx.musicStart(worldTrack);             // 'world_club' etc.
AudioFx.setMusicState({ wave: 1, wavesTotal: 20, stageHpPct: 1 });

// every 250 ms in the battle loop
AudioFx.setMusicState({ wave: run.wave, wavesTotal: run.wavesTotal, hypePct: run.hype / run.hypeMax,
  bossAlive: !!run.boss, stageHpPct: run.stageHp / run.stageHpMax, enemiesOnField: run.enemies.length });
if (lowNow !== lowPrev) AudioFx.heartbeat(lowNow);

// deploy
const bi = AudioFx.beatInfo(); const onBeat = bi && Math.min(bi.sinceLast, bi.toNext) < 0.08;
AudioFx.play('deploy'); if (onBeat) AudioFx.play('perfect_beat');

// merge
AudioFx.play(level === 7 ? 'merge_7' : level >= 5 ? 'merge_big' : 'merge');
if (level === 7 && firstSeven) AudioFx.play('drop_big');

// combo
if ([10, 25, 50, 100].includes(combo)) AudioFx.play('combo_milestone', { pitch: 1 + Math.min(1, combo / 100) });

// hype full
AudioFx.play('drop_big');   // or 'hype_full' for the short one

// leave battle / pause / results
AudioFx.heartbeat(false);
```

## Mixing and limits

Music bus 0.56 of the music volume, sfx bus 1.15 of the sfx volume, master compressor (-16 dB threshold, 6:1). Voice cap 44 (22 for the
spammy `LOW` set, which now also includes `boss_hit`, `perfect_beat`, `ui_pop`). Per-name minimum gaps (seconds): drop_big 2.5, hype_full 0.6, synergy 0.15,
reroll_drop 0.15, wave_preview 0.3, perfect_beat 0.06, boss_hit 0.12, merge_7 0.5, combo_milestone 0.12, stage_low 1.0, ui_pop 0.04.
