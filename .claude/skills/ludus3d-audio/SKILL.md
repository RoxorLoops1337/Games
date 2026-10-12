---
name: ludus3d-audio
description: Ludus Maximus 3D only. Procedural Web Audio engine for js/audio.js (no audio files): sfx catalog with recipes, crowd bed, adaptive music (ludus, prep, arena, victory, defeat), mix levels, autoplay/iOS rules, and the arena.js event to sound mapping. Reference code and verifier live in ludus_maximus_3d/lab/.
---

# Ludus 3D audio (procedural, zero files)

Reference implementation (tested, copy it into `js/audio.js`, keep the API): `ludus_maximus_3d/lab/ref/audio_ref.js`.
Listen: `lab/audio_ref.html` (serve repo root, click Unlock, then any button). Verify: `node ludus_maximus_3d/lab/audio_ref_verify.mjs [outDir]` (Chromium, OfflineAudioContext, asserts non-silent / no clip / duration / spectrum / seed determinism / intensity monotonic, prints table, writes WAVs). Re-run it after every level or recipe change; it must say ALL OK.
Sources of knowledge: Web Audio spec recipes, Farnell "Designing Sound" style (noise + filters + envelopes), Karplus-Strong; written from experience, no live web research was possible.

## API

```js
import { createAudio } from './audio.js';
const A = createAudio({ seed });        // never throws; all calls are no-ops without AudioContext (Node, old browsers)
A.unlock();                             // call inside the first pointerdown/keydown/touchend handler. returns Promise<bool>
A.setMaster(v) A.setMusic(v) A.setSfx(v)             // 0..1 (sfx slider also drives crowd)
A.sfx(name, { pan:-1..1, gain:1, pitch:1, voice:0..3, heavy:bool, element, kind, when })  // returns false if dropped
A.crowd(level)                          // continuous bed, 0 stops (fades), call every frame or on change, smoothed internally
A.duck(amount, hold)                    // sidechain duck of music (big sfx already do it)
A.music.setMode('ludus'|'prep'|'arena'|'victory'|'defeat', { fade })  // crossfade, same mode = no-op
A.music.setIntensity(0..1)              // smoothed, arena layers follow it
A.music.stop(fade) A.music.seed(n)
```
Graph: sources -> sfx/music/crowd buses -> master -> compressor (glue, -16 dB, 4:1) -> limiter (-2 dB, 20:1, 1 ms) -> 0.92 trim -> destination. Music bus has a duck gain; music and crowd get convolver sends (procedural 2.3 s colosseum IR, 28 ms predelay, darkening tail); sfx have a per-sound `wet` send. MUSIC_TRIM 0.32 keeps music about 9 dB under hits.

## Level / mix table (post limiter, measured; peaks in dBFS)

| group | peak | notes |
|---|---|---|
| ui tap/confirm/coin | -20 to -11 | tap quietest |
| footstep, swish, miss, dust | -18 to -9 | spam sounds, keep low |
| swordHit -11, shieldBlock -10, spear/bash -9..-8 | -11 to -8 | main combat layer |
| grunt/hurt/deathCry | -10 to -5 | voices; hurt loudest |
| crit, deathThud, drum | -6 to -4 | accent |
| crowd one-shots | -10 to -4 | roar loudest |
| crowd bed | -20 (0.2) / -11 (0.6) / -5 (1.0) | sits under everything |
| fanfare, horn, gate, ults | -6 to -3 | duck music 45-55% |
| music | -14 to -5 peak, about -30 to -21 RMS | arena rms rises about 9 dB from intensity 0 to 1 |
Hard rule: nothing above -3 dBFS (limiter threshold -2). Sub bass below 60 Hz is inaudible on phones: every thump adds a 2x partial and drones start at 65+ Hz.

## Recipes (all in audio_ref.js, one function each)

Primitives: `burst()` = looped noise buffer (white/pink/brown, 3 s, seamless) -> biquad with exponential frequency sweep -> AR gain. `thump()` = sine pitch drop + octave triangle. `partials()` = inharmonic sines for metal. `voice()` = sawtooth (pitch glide, 27 Hz rasp jitter) + breath noise into 3 parallel band-pass formants. `brass()` = 3 detuned saws, low-pass that opens (f*1.5 to f*6) then settles, +6 dB at 900 Hz, +3 dB at 2.3 kHz, 60 ms pitch scoop from -50 cents. `pluck()` = Karplus-Strong precomputed into an AudioBuffer and cached per pitch (a feedback DelayNode cannot go above about 340 Hz). `flute()` = sine + soft triangle octave + band-passed breath, vibrato fading in. `strings()` = 2 detuned saws, low-pass.

- swordHit: noise 3.2k to 1.1k (90 ms) + metal partials 1750x[1,1.51,2.37,3.9] + thump 170 to 62. Crit adds 1420 Hz ring 0.75 s, sub saw boom, shimmer, ducks music.
- shieldBlock: thump 230 to 95 + low-passed noise + square partials 640. metalClang: partials 610x[1,2.76,5.4,8.93,12.1], 1.2 s tail.
- swish light: band noise 700 to 3600 Hz, 160 ms, slow attack; heavy: 260 to 1500, 340 ms + pink low layer. miss: downward sweep, soft.
- grunt/hurt/deathCry: `voice()` with `voice` 0 brute (92 Hz, vowel o), 1 veteran (122, a), 2 youth (175, e), 3 lithe (235, a). grunt falls 1.15 to 0.82, hurt rises 1.0 to 1.35 (yelp, vowel a) , death falls 1.2 to 0.45 with formants closing.
- deathThud: thump 110 to 50 + pink low noise + sand scatter noise + tiny armor rattle. footstep: low-passed pink thump + 4 grit ticks. dust: band noise 1400 to 500.
- netThrow: rising noise + AM 34 Hz flutter band (rope). spearThrust: fast 1k to 5.2k sweep + tk. bash: thump + wood crack (2.2 kHz band) + square partials.
- stunChime: three bell notes 1568 Hz (middle one lowered) partials [1,2.01,3]. healSparkle: sine run on a major pentatonic from 1318 Hz with 3rd harmonic. coin: square 1318 then 1975. uiTap: triangle 820 to 520, 90 ms. uiConfirm: 523 then 784. uiError: 2 detuned low squares 165 Hz through low-pass.
- levelUp: brass fanfare D (3 repeated notes, rise to F#, A) + timpani + crash. horn (cornu): G2 98 Hz, slow attack 0.18, rising fifth call, dark (bright 0.7), big reverb send.
- gate: brown noise low-passed 140 to 330 Hz, AM 13 Hz, 14 random chain clinks, final slam. drum: tympani = thump + inharmonic partials [1.504,1.99,2.44] + skin click.
- ults: fire = rising low-passed pink roar + crackle ticks + low brass; lightning = 3 kHz crack + saw zaps 5k down to 400 + brown thunder; earth = double thump + brown rumble + rock debris ticks; wind = three overlapping resonant sweeps (Q 6) + ghost whistle; holy = 4 formant "ah" voices on a major chord + bell arpeggio + high shimmer.
- crowd one-shots: gasp = pink noise 700 to 2200 inhale; cheer/roar/boo/chant = pink noise band + N detuned formant voices (vowel a for cheer, o roar, u boo falling) + claps; chant = 4 pulses with stomp drum.
- crowd(level) bed: pink murmur band (380 to 800 Hz) + two narrow formant bands (700-960, 1100-1500) with slow LFO swells (0.11 to 0.6 Hz) + brown stomp rumble + faint high rustle. Target gain 0.03 + 0.32*level^1.3, time constant 0.4 s.

## Music engine

Scheduler: a 45 ms `setInterval` calls `pump(ctx.currentTime + 0.3)`; each player schedules 16th-note steps ahead on the audio clock (never schedule from setTimeout time). Each mode is {bpm, init, bar(p,bar,t), step(p,s,t,sp)}; a player has its own bus, drone oscillators and seeded RNG `mulberry(hash(seed, mode, phrase))` re-rolled every 4 bars (chord progression, rhythm cell, motif, stab pattern), so phrases differ but the same seed replays exactly. setMode fades the old player out and new in (1.5 s default, victory/defeat cut in fast), old players die after the fade.
- ludus 92 bpm, D Dorian with Phrygian dominant on cadence bars: drone D2, lyre (KS pluck) 8th arpeggio with swing and random dropouts, flute motif on odd bars, frame drum + shaker.
- prep 76-84 bpm, D Phrygian: tympani heartbeat, wood tick, quiet low strings ostinato whose cutoff rises with bar count (tension), brass swell every 4 bars.
- arena 100 to 124 bpm (follows intensity), E Phrygian dominant. Layers by intensity I: drone + tympani on 1 and 3 (always), strings ostinato (always, louder from 0.1), skin drum on 2 and 4 from 0.22, offbeat drums from 0.5, brass stabs root+fifth from 0.3 (octave at 0.7), high string pad from 0.55, 16th roll pickups from 0.78, crash every 8 bars from 0.6. Each gate uses smoothstep so layers fade in, never switch.
- victory: 1 bar brass stinger (timpani roll + crash) then D major loop (fast lyre arpeggio, brass counter, flute). defeat: 58 bpm D Aeolian, funeral drum, sparse lyre, low string swell, long flute.

### Intensity from fight hype (feed `music.setIntensity` ~4 times per second, smoothing is internal)
`target = 0.15 + 0.25*alivePressure + 0.3*recentDamageRate + 0.2*ultActive + 0.1*lowHpFighter`, each term 0..1; bump by +0.25 on crit/ult/down (decay 0.5/s); last fighter standing under 25% HP: force 0.9; roar event: +0.2. Typical flow: gate opens 0.2, trading blows 0.4-0.6, ult/kill 0.9, then back down. Call `crowd(level)` with `0.25 + 0.75*intensity` and fire crowdRoar/gasp on the matching events. Set mode 'prep' during pre-fight screens, 'arena' at gate open, 'victory'/'defeat' on `end`, 'ludus' in the hub.

## arena.js event -> sound

| event | sound |
|---|---|
| atk | none (wait for hit/miss), maybe swish at wind-up with `heavy` for big weapons |
| hit | swordHit; `crit` -> swordHitCrit; blocked/`save`/guard -> shieldBlock; `tech` bash -> bash; spear style `tech` -> spearThrust; add hurt (voice of dst) 60% of hits, grunt for attacker 25%; `hz` (hazard) -> dust; pan from x position |
| miss | miss (inv -> metalClang) |
| whiff | swish |
| dash | dust + footstep (pitch 0.9) |
| proj | swish (pitch 1.3; `long` heavy) |
| aoe | big -> ultEarth style thump; else drum 'mid'; color maps element (red/orange fire, blue/yellow lightning, brown earth, white holy) |
| tele | rising low drum tick, or none (visual warning), at most one per 0.5 s |
| zap | ultLightning at gain 0.4 |
| hook | netThrow |
| bleed | tiny dust at gain 0.3, throttled to 1 per fighter per 0.8 s |
| status | stun -> stunChime; guard -> shieldBlock gain 0.5; rage/frenzy -> drum low; rally -> uiConfirm |
| heal | healSparkle |
| down | deathCry (voice) then deathThud at +0.35 s, crowdGasp, intensity bump |
| ult / rune | element sting (`ult` with element), duck music, crowdRoar after 0.6 s |
| roar | crowdRoar (fav true: crowdCheer plus chant), bed boost |
| revive | healSparkle + horn |
| favorready | uiConfirm + crowdCheer |
| end | music victory/defeat, crowdRoar or crowdBoo |
Hub UI: uiTap on every button, uiConfirm on accept, uiError on invalid, coin on gold change, levelUp on level up, gate when arena doors open, horn at fight start.

## Pitfalls

- Autoplay: create/resume the context only from a user gesture (`pointerdown`, `touchend`, `keydown`; on iOS `touchstart` does not unlock). Call `unlock()` in every gesture until it returns true. sfx() before running drops sounds on purpose (otherwise a burst plays on resume).
- iOS: the silent mute switch silences Web Audio; context can go `interrupted` after calls or tab switches, so resume on `statechange` and `visibilitychange`; use `webkitAudioContext` fallback; no `createStereoPanner` on very old Safari (guarded); keep sample rate default (a forced rate fails).
- Never `new AudioContext` at module load. Never schedule with setTimeout for rhythm: use the lookahead scheduler.
- Exponential ramps cannot start/end at 0 (use 0.00001) and need a prior setValueAtTime.
- Always `stop()` oscillators and `disconnect()` finished buses, otherwise nodes leak (the engine does so on fade end). Cap polyphony: per-sound max concurrent, 28 voices soft, 40 hard, retrigger guard 30 ms per sound, spam sounds (swish, footstep, bleed) must be throttled by the caller too.
- Feedback delay lines are quantised to 128 samples inside a cycle: use precomputed buffers for pitched plucks.
- Do not trust peak before the limiter: judge levels after it (the verifier does). A hot music bus will make the limiter pump the sfx.
- No Math.random in music: seeded RNG only, so tests are deterministic.
- Offer a mute toggle persisted in localStorage (wrap in try/catch) and pause on `visibilitychange`.
