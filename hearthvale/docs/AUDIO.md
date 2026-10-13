# Hearthvale audio

All sound is synthesised with the Web Audio API (no audio files). Files:

- `js/audio.js`   engine, music, ambience, master chain, persistence, the `Audio` singleton and the legacy wrappers.
- `js/sfx.js`     the sound catalogue (recipes), voice kit helpers and pure helpers (`VoiceLimiter`, scales, rng).
- `lab/audio.html` dev-only listening and measurement page (open `http://localhost:8123/lab/audio.html`).
- `tests/hearthvale_audio.test.mjs` pure logic tests (no Web Audio needed).

## API

```js
import { Audio } from './audio.js';
```

| call | what it does |
| --- | --- |
| `Audio.unlock()` | Creates and resumes the AudioContext. Must run inside a user gesture. It also self-installs on `pointerdown`, `touchend`, `mousedown`, `keydown` and `click` at import time, so calling it is optional but harmless (idempotent). Returns `false` when Web Audio is missing. |
| `Audio.sfx(name, { pan, vol, pitch, delay })` | Plays a catalogue sound. `pan` -1..1, `vol` 0..1.5 (1 = calibrated level), `pitch` multiplier (1 = normal, 0.8 = lower), `delay` seconds. Returns `true` if it started (false when muted, locked, on cooldown, or dropped by the voice limiter). Unknown names are ignored. |
| `Audio.ui(name)` | Same as `sfx`, centred. Use it for HUD and panel sounds. |
| `Audio.setMusic(mode)` | `'day' \| 'dusk' \| 'night' \| 'rain' \| 'festival' \| 'title'`, or `null` to fade out. Crossfades (2 to 5 s). Calling it with the current mode is a no-op, so it is safe to call every frame. Safe before `unlock()`: it is remembered and starts at unlock. |
| `Audio.setAmbience({ night, rain, wind, water })` | Each 0..1, partial updates allowed. Smooths over about 1.2 s. Beds start and stop on their own (a bed at 0 costs nothing). |
| `Audio.setVolume(ch, v)` / `Audio.getVolume(ch)` | `ch` is `'master' \| 'music' \| 'sfx' \| 'ambience'` (`'amb'` also accepted). `v` 0..1 on a squared curve (0.5 is -12 dB). Defaults: master 0.9, music 0.7, sfx 0.9, ambience 0.7. Persisted. |
| `Audio.mute(bool)` / `Audio.isMuted()` / `Audio.toggleMute()` | Hard mute of everything (also skips sfx scheduling). Persisted. |
| `Audio.panFor(x, camX, range = 22)` | Stereo pan -0.85..0.85 for a world x seen from camera x. `Audio.listener.set(camX)` stores a default camera x so `panFor(x)` works alone. |
| `Audio.volFor(dist)` | Distance attenuation 0.15..1 (full volume inside 6 units, fading to 0.15 at 40). |
| `Audio.catalogue()` | `[{ name, cat }]` for every sound. |
| `Audio.stats()` | Voice and node counts (for debugging; the lab shows it live). |
| `Audio.createEngine(ctx, opts)` | A standalone engine on any (Offline)AudioContext. `opts`: `seed`, `settings`, `offline`, `dest`, `persist`, `timer`. Methods: `sfx ui setMusic setAmbience setVolume mute pump tick stats dispose getAnalyser`. In an OfflineAudioContext call `eng.pump(seconds)` once after `setMusic` to schedule the music. |

localStorage keys (all access is in try/catch): `hearthvale.vol.master`, `hearthvale.vol.music`, `hearthvale.vol.sfx`, `hearthvale.vol.amb`, `hearthvale.muted` (`'1'`). The legacy toggle also keeps writing `hearthvale.music`.

### Legacy exports (still work, thin wrappers)

`toggleAudio(force)`, `setAmbient(night, rain)`, `audioOn()`, `wantsMusic()`. `setAmbient` picks the music mode itself with hysteresis (`rain` above 0.5 rain, `night` above 0.6 night, `dusk` above 0.25, else `day`) and forwards night and rain to `setAmbience`. Old sfx names map through `ALIASES`: `click`->`tap`, `pop`->`tap2`, `done`->`buildDone`, `level`->`levelUp`, `bad`->`error`, `coin`->`coin` (so `Audio.sfx('click')` works too).

### Migrating main.js 1:1

```js
// old                                  // new
sfx('click')                            Audio.ui('tap')            // every command button
sfx('pop')   (popup text)               Audio.sfx('tap2', { pan })
sfx('done')  (building finished)        Audio.sfx('buildDone', { pan: Audio.panFor(x, camX) })
sfx('level')                            Audio.sfx('levelUp')
sfx('bad')                              Audio.sfx('error')
sfx('coin')                             Audio.sfx('coin')
addEventListener('pointerdown', ...)    Audio.unlock()  (optional, auto installed)
setAmbient(night, rain)                 Audio.setAmbience({ night, rain, wind, water }); Audio.setMusic(mode)
```

Decide the mode from time of day: `day` (morning to afternoon), `dusk` (sunset hour), `night`, `rain` when raining (wins over the others), `festival` while the festival event is active (wins over day/dusk), `title` on the title screen.

## Catalogue (76 sounds)

Every sound has 4 round-robin variants (shuffled, never the same twice in a row) plus random pitch jitter, a cooldown against machine-gunning, and a cap on simultaneous copies. `rev` is its reverb send.

| group | names |
| --- | --- |
| UI | `tap tap2 back open close tab toggle confirm deny hover` |
| economy | `coin coins cashRegister sell buy unlock reward giftReceived giftSent` |
| world | `place build buildDone upgrade demolish hammer sawing chop mine dig harvest sow water fishCast fishCatch gather craft cook bake stir pour research step door` |
| progress | `levelUp questComplete achievement orderComplete projectStage streak daily festivalStart merchantArrive visitorArrive` |
| villagers | `hire hungry eat cheer giggle` |
| animals | `cluck moo baa woof meow quack ribbit buzz oink` |
| ambient | `birdChirp windChime bellRing splash owl drip` |
| notify | `toast warn error` |

`streak` accepts `n` (the streak length 2..8) as an extra option: `Audio.sfx('streak', { n: 5 })`.

## Recommended triggers

| game event | sound |
| --- | --- |
| any HUD button, panel tab change | `ui tap` / `ui tab` |
| open or close a panel or sheet | `ui open` / `ui close` |
| back, cancel | `ui back` |
| on/off switch (pass `pitch: 0.8` for off) | `ui toggle` |
| Place/Build confirm | `ui confirm`; tapping a valid site `place` |
| button disabled, cannot afford, blocked ground (`link.onNack`) | `ui deny` (hard failures: `error`) |
| hover over a button (desktop only) | `ui hover` |
| coin chip changes by a small amount | `coin`; big payout `coins` |
| Sell goods, Buy item | `sell`, `buy` |
| Market or Merchant trade completes | `cashRegister` |
| new building or recipe unlocked in the Study | `unlock` |
| quest reward claimed, daily reward claimed | `reward`, `daily` |
| gift received (`e.t === 'gift'`, `e.to === myId`) / gift sent | `giftReceived` / `giftSent` |
| a building starts construction | `build` (repeat `hammer` while building, every 0.8 to 1.5 s with `pan`) |
| building finished (`e.t === 'built'`) | `buildDone` |
| building upgraded | `upgrade` |
| building removed | `demolish` |
| villager chops tree / mines rock or clay / digs | `chop` / `mine` / `dig` (once per work swing, spatial) |
| sawmill working | `sawing` |
| wheat sown / harvested | `sow` / `harvest` |
| watering | `water` |
| dock: cast / catch | `fishCast` / `fishCatch` |
| gathering berries, wood bundle pick-up | `gather` |
| kiln or workshop craft | `craft` |
| kitchen cook / mill-bakery bake | `cook` / `bake`; `stir` and `pour` for long recipes |
| Study research started / finished | `research` / `unlock` |
| level up (`e.t === 'levelup'`) | `levelUp` |
| quest done (`e.t === 'quest'`) | `questComplete` |
| achievement (`e.t === 'ach'`) | `achievement` |
| Valley order finished (`e.t === 'order'`) | `orderComplete` |
| Great Project stage (`e.t === 'project'`) | `projectStage` |
| login or work streak | `streak` with `n` |
| daily reward (`e.t === 'daily'`) | `daily` |
| festival begins (`e.t === 'festival'`) | `festivalStart` + `Audio.setMusic('festival')` |
| merchant arrives (`e.t === 'merchant'`) | `merchantArrive` |
| visitor arrives / is served (`e.t === 'visitor'`) | `visitorArrive` |
| villager hired | `hire` |
| villager hungry (low food) | `hungry` (rate limit it to once per minute per villager) |
| villager eats | `eat` |
| emote, celebration | `cheer`, `giggle` |
| animal in view: periodic idle calls | `cluck moo baa woof meow quack oink` every 8 to 25 s per animal when within the camera; `buzz` near flowers; `ribbit` near water at night |
| animal collected/fed | the animal's own call, `pan` from its x |
| footsteps (villagers walking, optional) | `step` every 0.35 s for the closest 1 or 2 only |
| toasts | `toast` (info), `warn`, `error` |
| scene one-shots (also played automatically by the ambience engine) | `birdChirp windChime bellRing splash` (use `splash` for fish or rain on the sea if you want manual ones) |

Tips: pass `pan: Audio.panFor(worldX, camX)` and `vol: Audio.volFor(dist)` for anything on the map; keep UI sounds unpanned. Do not call `sfx` for every villager every frame: drive it from actions (swing events), the cooldown and the voice limiter are a safety net, not a design.

## Mixing

- Loudness unit used here: LUFS-M, K-weighted (ITU-R BS.1770) loudest 400 ms, measured offline with every volume at 1. Targets at volume 1: ui -22, economy -19, world -20, progress -17 (fanfares are deliberately the loudest), villagers -20, animals -20, ambient one-shots -26, notifications -20; music about -22 (peak of any mode), ambience beds -30 (wind, sea, rain) and -38 (insects, crickets).
- Defaults (master 0.9, sfx 0.9, music 0.7, ambience 0.7 on the squared curve) put music about 9 dB under sfx and ambience about 14 dB under sfx.
- Master chain: -14 dB pre-gain, high shelf -2 dB at 7 kHz, compressor (threshold -14 dB, 3:1, 6 ms attack), limiter (-3 dB, 20:1), soft clipper with a hard ceiling of 0.97 so nothing can clip.
- Reverb: generated stereo impulse response (2.2 s, darkening tail). Music and ambience have their own sends.
- Voices: at most 24 simultaneous sfx (the quietest, most finished voice is evicted with a 12 ms fade), 8 ambience one-shots. Pool of 30 reusable strips. All nodes of a voice are disconnected when it ends.

## Measured loudness (offline render through the real engine, all volumes 1)

| category | n | target LUFS-M | measured min / max | spread dB | max peak | longest tail (s) | max abs DC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ui | 10 | -22 | -22.0 / -22.0 | 0.0 | 0.42 | 2.2 (confirm) | 6e-06 |
| economy | 9 | -19 | -19.0 / -19.0 | 0.0 | 0.30 | 2.5 (unlock) | 7e-06 |
| world | 24 | -20 | -20.0 / -20.0 | 0.0 | 0.54 | 2.5 (research) | 7e-04 |
| progress | 10 | -17 | -17.0 / -17.0 | 0.0 | 0.45 | 3.7 (visitorArrive) | 1e-05 |
| villagers | 5 | -20 | -20.0 / -20.0 | 0.0 | 0.28 | 2.4 (hungry) | 2e-04 |
| animals | 9 | -20 | -20.0 / -20.0 | 0.0 | 0.40 | 1.0 (moo) | 4e-07 |
| ambient | 6 | -26 | -26.0 / -26.0 | 0.0 | 0.17 | 4.3 (bellRing) | 1e-05 |
| notify | 3 | -20 | -20.0 / -20.0 | 0.0 | 0.34 | 1.5 (toast) | 6e-06 |

Music (36 s offline, first 6 s skipped): LUFS-M max day -22.0, dusk -21.9, night -22.0, rain -21.8, festival -22.0, title -22.0; peaks 0.25 to 0.31.
Ambience beds at full level (LUFS-M): wind -30.0, water -30.0, rain -30.0, insects (day) -38.0, crickets (night) -38.0, all night+wind+water -32.2.

Result: no sound clips (highest peak 0.54, the soft clipper ceiling is 0.97), none is flagged quiet, cut off or DC-offset, and every category is within 0.1 dB of its target. Stress test (200 calls in one second through the lab): 0 exceptions, 24 voices max, all nodes released (`liveNodes` back to 0 nine seconds later).

## Platform notes

- Autoplay: no browser lets a page make sound before a user gesture. `unlock()` creates the context inside the gesture and resumes it; the engine also retries on every later gesture until the state is `running`.
- iOS Safari: the first sound must start inside a touch handler (we play a silent 1-sample buffer to fully unlock output). The silent switch mutes Web Audio unless `navigator.audioSession.type = 'playback'` is set (iOS 16.4+; the engine sets it). iOS can put the context in the non-standard `interrupted` state after a call or app switch: any later tap resumes it. We suspend the context when the page is hidden (`visibilitychange`, `pagehide`) and resume on return.
- Sample rate follows the device (44.1 or 48 kHz); noise buffers and the impulse response are generated at the context rate.
- `StereoPannerNode` is missing only on very old Safari; strips then skip panning.
- Battery: music and ambience schedule 1.6 s ahead from one 180 ms timer; muting stops scheduling; hidden tabs suspend the context. Beds that are at 0 are disconnected.
- Offline rendering: `Audio.createEngine(new OfflineAudioContext(2, sr * secs, sr), { seed, settings, offline: true })`. See `lab/audio.html`.

## Adding a sound

Add a `def(name, category, { pv, rev, cd, max }, (k, o) => { ... })` in `sfx.js` using `tone`, `nz`, `bub`, `mal`, `arp`, `sparkle`, `vox`, `chirp`, then run the lab report; the calibration script in the session scratchpad rewrote the `TRIM` table (or edit `TRIM[name]` by hand: it multiplies the volume so the sound hits its category target). Keep sounds short, soft attack-transient plus tasteful decay, no square waves.
