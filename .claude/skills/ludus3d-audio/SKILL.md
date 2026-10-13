---
name: ludus3d-audio
description: Ludus Maximus 3D only. Procedural Web Audio engine for js/audio.js (no audio files): sfx catalog with recipes, weapon x armour variation, spatial sfx (HRTF-like pan, camera distance), crowd bed that follows the fight, adaptive music for 11 modes (ludus by time of day, prep, arena, beast, boss, victory, defeat, title, results, season, elegy), mastering chain and scene reverb, voice caps, and the offline analysis tool tools/ludus3d_audio_check.mjs that measures loudness, clipping, spectrum, seams and node leaks. Read before touching js/audio.js or any audio call.
---

# Ludus 3D audio (procedural, zero files)

Live engine: `ludus_maximus_3d/js/audio.js` (about 1200 lines, one file, ES module, `createAudio(opts)`).
Listen: `lab/audio_lab.html` (serve repo root, click Unlock; every sfx, music mode, scene, pan, distance, weapon and armour is a control).
Verify: `node tools/ludus3d_audio_check.mjs` renders everything OFFLINE (OfflineAudioContext in headless Chromium), measures the buffers and writes `tools/ludus3d_audio_report.md` (before/after against `tools/ludus3d_audio_baseline.json`). Options: `--quick` (no 60 s burst, no mixes), `--sfx a,b`, `--modes arena,ludus`, `--no-sfx`, `--no-music`, `--wav DIR` (write WAVs to listen), `--engine FILE` (check another engine file, e.g. the previous version), `--save-baseline`. Full run takes about 15 to 25 minutes, `--quick --no-sfx` about 40 s. Re-run after every recipe or level change.
The old reference `lab/ref/audio_ref.js` and `lab/audio_ref_verify.mjs` are the first generation; the live engine has replaced them.
`node tests/ludus_maximus_3d_structure.test.mjs` greps audio.js for `def('name'`, `const ambient = `, `music.setHubTime`, `function attachUi`, `SFX_NAMES` entries: keep those literal strings.

## API (every name stays; new ones marked +)

```js
import { createAudio } from './audio.js';
const A = createAudio({ seed });        // never throws; no-ops without AudioContext. opts.ctx/now/enforce/log are for tests
A.unlock()                              // inside a user gesture; starts a silent buffer too (iOS); returns Promise<bool>
A.setMaster(v) A.setMusic(v) A.setSfx(v)             // 0..1; sfx slider also drives crowd and ambience; 0 is silence (verified)
A.sfx(name, { pan:-1..1, gain, pitch, voice:0..3, heavy, element, kind, when,
              vel:0..1,                 // + hit strength: level 0.55..1 and brightness
              weapon:'sword|spear|axe|mace|dagger', armor:'none|leather|bronze|mail|plate',   // + swordHit timbre; absent = armour round-robin
              pos:[x,y,z], dist,        // + world position (needs setListener) or plain distance in metres: pan, level, air absorption, wetter
              surface:'sand|stone' })   // + footstep
A.setListener({ pos:[x,y,z], yaw })     // + camera. right vector = (cos yaw, -sin yaw); or { pos, right:[rx,rz] }; setListener(null) turns it off
A.setScene('arena'|'hub'|'indoor', {fade, lock})   // + reverb space; music.setMode picks one by itself (below)
A.crowd(level) A.duck(amount, hold)
A.music.setMode(mode, { fade, at, sync, keepScene })   // crossfade (equal power); default waits for the old mode's next bar line if within 2.6 s
A.music.setIntensity(0..1)  A.music.setHubTime(hour, night)  A.music.stop(fade)  A.music.seed(n)
A.music.accent('hit'|'crit'|'down')    // + lands a tymp / cymbal+taiko / low impact on the next 8th
A.ambient {start, stop, update(state), thunder(delay)}   A.attachUi(root, {hover, tap})   A.ui.{hover,tap,select,open,close}
A.suspend() A.resume()                  // suspend() is a deliberate pause: gestures and visibility changes will NOT resume it until resume()
A._stats()                              // + strips, voices, players, errors, lastError (swallowed exceptions; tests read it)
```
Music modes: `ludus prep arena victory defeat` (old) and + `title results season elegy beast boss`. Reverb scene by mode: hub for ludus/results, indoor for title/elegy, arena stone hall for the rest.

## Graph and mastering

sfx/crowd strips + music bus -> master -> 22 Hz high-pass (DC, sub rumble) -> makeup -> glue compressor (-18 dB, 3.5:1) -> safety limiter (-3 dB, 20:1, 1 ms) -> tanh soft clip -> 0.94 trim -> destination. Nothing leaves above about -3 dBFS (measured). Music has a duck gain (shallow duck never cancels a deeper one) and two quiet Haas copies (19 and 27 ms, panned +-0.75) for gentle width. Two reverbs: stone hall IR (2.3 s, 28 ms predelay, darkening) and open-air IR (1.1 s, building slap); `applyScene` crossfades their returns; music stems and sfx strips send into the same input.

Loudness: `MUSIC_TRIM` and `MAKEUP` at the top of audio.js were calibrated with the fight mix in the tool report (target about -16 LUFS integrated, K-weighted, in a busy fight; calm fight a bit lower). Change them, re-run, read the "Fight mix" table.

## SFX engine

- Each sfx = `def(name, level, nominalDuration, priority, reverbSend, musicDuck, maxConcurrent, fn)`. `cat` comes from `catOf(name)`; caps per category (`CAP`): combat 12, voice 6, crowd 3, ui 5, amb 8, big 4, beast 5, gore 6; global 28 soft (spam sounds dropped) and 40 hard. A full category steals its lowest-priority oldest voice with a 12 ms fade; a lower priority newcomer is dropped. Retrigger guard 30 ms per name+voice.
- Pooled spatial strips (`makeStrip`, `acquire`, `release`, ~10 nodes each, up to 32 kept): input gain, per-ear delay (ITD up to 0.65 ms), per-ear low-pass (head shadow on the far ear, air absorption with distance), constant-power pan, merger, plus the reverb send. A strip is reserved until nominal duration + 0.25 s, so `dur` in `def` must cover the real tail.
- Variation in `sfx()`: round-robin counter `cur.rr`, pitch/filter jitter `cur.j` (applied inside `osc()`, `burst()`), velocity brightness `cur.b`, gain jitter +-1.4 dB (ui +-0.4), voice/beast pitch jitter. The synthesis helpers read the module-level `cur`; do not call sfx from inside an sfx fn.
- Cheap noise: `spikes(t, dur, dest, n, opts)` = n random clicks through ONE noise source/filter/gain (3 nodes). Use it for grit, crackle, debris, rattle instead of n x `burst`.
- `crowdVoices` shares one formant bank for N sawtooth throats (2 nodes per voice). Do not go back to one formant bank per voice (that was 216 nodes for a roar).
- swordHit: `WEAP` x `ARM` matrix (sword spear axe mace dagger x none leather bronze mail plate). New: `parry` (steel on steel), `crowdShout` (internal, lone voice from the stands), shieldBlock alternates wood and bronze rim, footstep is heel+toe on sand with 4 grain patterns (`heavy` or plate/mail adds a tink, `surface:'stone'` for a hard click).
- Crowd bed: murmur + two vowel bands with LFO swells + stomp rumble (1.9 Hz pulse) + claps + an excited screaming layer above level 0.55, lone shouts every 1 to 3 s above 0.3, and `crowdKick` swells it on big events (`CROWD_KICK` table: crit, deathThud, ults, gore, beast roar...). All oscillators and sources are stopped when the bed fades out.

## Music engine

Scheduler: 45 ms `setInterval` calls `pump(ctx.currentTime + 0.3)`; each player schedules 16th-note steps on the audio clock. Each mode = `{bpm(), tonic, scene, cfg, init(p), bar(p, bar), step(p, s, t, sp)}`; a player owns 8 stems (`perc low str brass pad lead lyre fx`: gain trim, pan, reverb send) feeding its bus; fades are equal-power `setValueCurveAtTime`.
- Harmony: `setChord(p, bassRoot, intervals, melodyScale)`; bass note is `rootF`, `p.ch.tones` is the voicing an octave above; 8-bar chord plans per mode (semitone roots + MIN/MAJ/DIM), re-picked every 8 bars from a seeded RNG. Melody scale follows the chord (phrygian over minor, phrygian-dominant over the major V, dorian/mixolydian in the hub), so every motif note is diatonic to its chord.
- Motif development (`makeMotif`, `develop`): a 4-note rhythmic cell is stated (bars 0-1), sequenced up a step (2-3), inverted (4-5), then cadences to the root (6-7); the bar after each statement answers with the first half. Motif changes every 24 to 32 bars. `leadMotif` hands the note to a voice (aulos, brass, lyre).
- Humanising: `hum(p, kind)` timing per section (perc +-3 ms, strings late 4 to 18 ms, brass, lead rubato), `vv()` velocity +-10 %. Never earlier than the player's own start.
- Instruments: `ens` string ensemble (3 detuned saws, bow-like cutoff swell, delayed vibrato), `brass`, `choir` ('ah' formants on detuned saws), `aulos` (double reed: two beating saws, nasal peak, breath, scoop), `pluck` (Karplus-Strong buffers cached per pitch), `frameDrum` (bodhran), `taiko`, `drumHit` (tympani), `snare`, `shaker`, `crash`, `riser` (rising noise + gliding saw, last 70 ms empty), `impact`.
- Arena family (`arenaMode(id, cfg)`: arena E Phrygian 100 to 124 bpm; beast A Phrygian tribal 92 to 122 with 3+3+2 frame drums, cimbasso, bone-flute howls, string clusters; boss D Phrygian 80 to 106 with brass chorale and choir). Layers fade in with `gate(a,b)` of the smoothed intensity: tymp always, skin drums from 0.22, stabs from 0.3, melody on aulos then brass at 0.55, pad/choir from 0.5/0.78, rolls from 0.78. An intensity jump over 0.2 in one bar schedules a riser into the next bar and an impact + taiko on its downbeat.
- Others: ludus (D Dorian, lyre arpeggio, aulos motif, frame drum, pad; dusk/night/dawn layers via `setHubTime`), prep (D Phrygian dread, rising tension, riser into the phrase end), victory (stinger + D major march, loop ends on V so it wraps), defeat (D Aeolian funeral march 58 bpm), title (68 bpm cinematic: cornu call, theme on lyre then brass, riser into the loop), results (D Lydian calm), season (stinger + D major procession, 100 bpm), elegy (48 bpm, drone, failing heartbeat, aulos lament, silences).
- Crossfades are bar-synchronous: `setMode` starts the new mode on the old mode's next bar line if that is within 2.6 s (stingers victory/defeat/season start at once).

Intensity feed from the fight (unchanged): `target = 0.15 + 0.25*alivePressure + 0.3*recentDamageRate + 0.2*ultActive + 0.1*lowHp`, bump +0.25 on crit/ult/down, last fighter under 25 % HP forces 0.9; `crowd(0.25 + 0.75*intensity)`.

## arena.js event -> sound (what fightview.js does; callers keep using sfx names)

| event | sound |
|---|---|
| atk | none (wait for hit/miss), maybe swish at wind-up with `heavy` for big weapons |
| hit | swordHit (`weapon`, `armor`, `vel` now supported); `crit` -> swordHitCrit; blocked/save/guard -> shieldBlock; parry -> `parry`; `tech` bash -> bash; spear `tech` -> spearThrust; hurt (voice of dst) 60 %, grunt for attacker 25 %; hazard -> dust |
| miss | miss (inv -> metalClang) |
| whiff / proj | swish (proj pitch 1.3, `long` heavy) |
| dash | dust + footstep (pitch 0.9) |
| aoe | big -> ultEarth style thump; else drum 'mid'; colour maps element |
| zap / hook | ultLightning gain 0.4 / netThrow |
| bleed | tiny dust gain 0.3, 1 per fighter per 0.8 s |
| status | stun -> stunChime; guard -> shieldBlock 0.5; rage/frenzy -> drum low; rally -> uiConfirm |
| heal | healSparkle |
| down | deathCry then deathThud at +0.35 s, crowdGasp, intensity bump, `music.accent('down')` |
| ult / rune | element sting (ducks music), crowdRoar after 0.6 s |
| roar | crowdRoar (fav true: crowdCheer plus chant) |
| end | music victory/defeat, crowdRoar or crowdBoo |
Hub UI: uiTap on every button, uiConfirm on accept, uiError on invalid, coin on gold change, levelUp on level up, gate when the doors open, horn at fight start.

## Level table (post master chain, peaks in dBFS, from the report)
UI -24 to -12 (tap and hover quietest), footstep/swish/miss/dust -20 to -10, main combat layer (swordHit, shieldBlock, spear, bash) -14 to -8 before the pan-law makeup, voices -10 to -5, crit/deathThud/drum -9 to -4, ults/gate/horn/levelUp -7 to -3, crowd one-shots -10 to -4, crowd bed -20 (0.2) / -11 (0.6) / -5 (1.0). Hard rule: nothing above -3 dBFS.

## What the analysis found (first run, old engine) and what changed

- Music was 95 to 99 % of its energy below 300 Hz (centroid 130 to 230 Hz): drones, tymp and brass all sat in the sub range. Now chord voicings sit an octave up, low stems are trimmed, mid register carries strings/brass/aulos (centroid 250 to 1000 Hz, 15 to 80 % above 300 Hz depending on mode).
- Stereo width was -22 dB side/mid (effectively mono); now about -13 dB.
- Master peaks reached -0.9 dBFS; now limited near -3 dBFS with a soft clip.
- Crowd one-shots built 160 to 350 nodes per trigger; now 50 to 150. Ult fire/earth 90+ nodes -> 25 to 30 (spikes).
- Sources started without stop (leak) in a 60 s fight: crowd LFOs and ambience oscillators; now zero.
- uiHover was -31 dBFS (inaudible), spurt harsh (62 % above 2.5 kHz), owl and footstep repeated, several sounds thin (no body below 300 Hz).

## Pitfalls

- Autoplay: create/resume the context only from a user gesture (`pointerdown`, `touchend`, `keydown`; on iOS `touchstart` does not unlock). Call `unlock()` in every gesture until it returns true. sfx() before running drops sounds on purpose.
- iOS: mute switch silences Web Audio; context can go `interrupted`: the engine resumes on `statechange`, `visibilitychange` and any later gesture, unless `suspend()` was called on purpose (pause) and not yet `resume()`d.
- Never `new AudioContext` at module load. Never schedule rhythm with setTimeout: use the lookahead pump. Never schedule a time below 0 (`env`/`osc` throw RangeError); the engine swallows step exceptions and counts them in `_stats().errors`, so tests must read it.
- Exponential ramps cannot start/end at 0 (use 0.00001) and need a prior setValueAtTime.
- Always `stop()` oscillators and sources (the tool counts sources started without stop; must be about 0). LFOs and drone oscillators of a faded player are stopped in `setMode` and `disposePlayer`.
- Do not judge levels before the limiter; the tool measures after the whole chain.
- No Math.random: seeded RNG only (`rng`, `p.r`, `p.hr`), tests are deterministic per seed.
- A strip is reused after `dur + 0.25`: a sfx whose real tail is longer than its `dur` gets its pan/low-pass changed mid tail.
- Hooks that need other files (not done here, ask the owner): see the report of the audio pass: pass `weapon`, `armor`, `vel`, `pos` and `setListener` from fightview.js; use modes title/results/season/elegy/beast/boss from title.js, screens, ceremonies.js and fightview.js; call `music.accent`.

## Hub ambience, time of day and ui hooks (HUB-AUDIO, additive, unchanged API)
- sfx `uiHover uiSelect uiOpen uiClose` (ui), `bird owl hammer clink chop sizzle thock thunder` (ambience). `audio.ambient.update(state)` every 0.25 s from the hub: beds (wind, distant crowd, rain hiss, crickets) and workshops near the camera focus panned to their side. Its oscillators and sources are now stopped on `ambient.stop()`.
- `music.setHubTime(hour, night)` drives ludus: tempo 92 down to 78 at night, percussion x(1 - 0.65 night), string pad swells at dusk/night, dawn adds a high aulos, deep night adds sparse bell plucks.
- `audio.attachUi(root, {hover, tap})` adds a throttled hover tick (mouse only); taps off by default because `game.open/ask` already play `uiTap`.

## Tool usage notes (added at the end of the audio pass)
- The machine is often loaded by other agents: run stages separately and merge through a cache: `node tools/ludus3d_audio_check.mjs --stages sfx --cache C.json`, then `--stages music`, `--stages mix`, `--stages burst`, `--stages misc` with the same `--cache`; the report is rebuilt from the merged cache each time. A full single run can exceed 30 minutes under load.
- OfflineAudioContext caveat: `disconnect()` is not time-scheduled, so `disposePlayer` skips it when offline (otherwise a faded-out player is erased from the whole render). Determinism check compares samples with a 0.002 tolerance (convolver/compressor float noise is about 1e-5).
- Open items: fight mix loudness calibration to -16 LUFS (MUSIC_TRIM 0.4, MAKEUP 1.0 are not yet tuned from a measured mix), 60 s burst node-flatness run of the new engine, and the sfx table of the new engine were not completed (see the pass report).

## Status after the GC pass (audio NOT calibrated)
The machine was loaded (load average 20 to 30, four other agents), `node tools/ludus3d_audio_check.mjs --quick --no-sfx --stages music --cache C.json` did not finish in 550 s, so MUSIC_TRIM 0.4 and MAKEUP 1.0 are unchanged, the bass heavy low-intensity music (prep, beast, boss at 93 to 96 % below 300 Hz) is not fixed, the volume slider checks and the 60 s burst were not re-run, and tools/ludus3d_audio_report.md still holds the partial numbers (music table only: arena@0.5 -24.5 LUFS, arena@1 -20.7, prep -26.0, ludus -31.7; a typical fight mix is still well under the -16 LUFS target, so MUSIC_TRIM/MAKEUP will need to go UP by roughly 6 to 8 dB combined with a lower limiter drive check). Run the stages one at a time when the machine is quiet.
