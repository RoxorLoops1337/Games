# Beatbox Heroes: mic-first rhythm game (plan)

Goal: playing with your voice is the default, reliable way to play. Taps stay live as the fallback.

## What exists today (so we do not rebuild it)
- `mic.js`: onset detector, 4-lane naive Bayes classifier (`makeClassifier`, `learn`, `trainFromSamples`), `listen`, `latencyMs/setLatencyMs`, `level`.
- `rhythm.js` (2D) and `park3d/mg_rhythm.js` (3D) each carry their OWN copy of startMic / micHit / classifier building.
- Mic is an off-by-default toggle (`E.settings.mic`). The classifier only learns from Sound Lab recordings. No calibration, no mic latency setting, no feedback when nothing is heard, no online adaptation.

## Gaps this work closes
1. Duplicate mic code in 2D and 3D, so every fix lands twice.
2. Nobody tells the player to set the mic up; accuracy depends on an optional Sound Lab step.
3. Latency is a guess (`R.lat` or 30 ms); the global AUDIO OFFSET also moves tap timing.
4. Silent failure: if the mic hears nothing, the player just misses.

## Design (one new module, thin call sites)
New `mic_play.js` -> `BBH.MicPlay`, plain script loaded after `samples.js`, pure logic is node-testable.

| piece | what |
|---|---|
| `buildClassifier(slot)` | priority: saved calibration profile > Sound Lab samples > defaults |
| `Calibrator` | state machine: prompts B, T, K, Pf x4 each, rejects weak and outlier hits, trains a classifier, returns `{profiles, quality, perLane}`; quality = leave-one-out accuracy; flags a lane that confuses with another |
| `LatencyProbe` | N metronome clicks, player says "t" on each, median (hit time - click time) minus current latency -> `micLat` ms |
| `resolveLane(ev, notes, T)` | the shared "unsure hit snaps to nearest unhit note within 200 ms" rule |
| `adapt(cls, ev, lane)` | confident AND judged-matching hits call `cls.learn` so the model tunes itself during play |
| `Watchdog` | no onset for 6 s while notes are due -> one hint "Can't hear you. Move closer or run MIC SETUP" |
| `start(opts)` | the one place that opens the mic, builds the classifier, applies `micLat`, listens, returns `{stop}` |
| `setupUI(host)` | one DOM overlay (works over the 2D canvas and the 3D scene): level meter, step prompts, per-lane result, RETRY / DONE |

Persistence (new keys only, nothing renamed): `localStorage bbh:micprof:<slot>` (profiles JSON), `E.settings.micLat`, `E.settings.micAsked`.

## Call-site changes
- `rhythm.js` and `park3d/mg_rhythm.js`: replace startMic/micHit/classifier code with `MicPlay.start`, `resolveLane`, `adapt`, `Watchdog`; add a MIC SETUP entry next to the MIC toggle. Behaviour of taps unchanged.
- First run: the first time a set starts on a device with a mic and `micAsked` is unset, one card: "PLAY WITH YOUR VOICE?" -> SET UP MIC (calibration) / TAPS ONLY. Choice stored. Existing players with `mic` already on are never asked.
- Settings screen (`game.js`): MIC SETUP button + mic latency readout.
- `index.html` (and the 3D test pages that load `mic.js`): add `mic_play.js`.

## Tests (small, fast, no browser needed for the logic)
New `tests/beatbox_heroes_micplay.test.mjs`, reusing the seeded synthetic voices from the mic suite:
- Calibrator: accepts 4x4 clean hits, ignores a cough/weak hit, quality high on separable synthetic voices, flags two identical lanes.
- buildClassifier priority order; profile JSON round trip.
- LatencyProbe: feed hits with a known 80 ms lag -> returns 80 +-5; jitter robust (median).
- resolveLane: low confidence snaps, high confidence does not, far notes ignored.
- adapt: only confident+matching hits learn; classifier count capped.
- Watchdog: fires once after silence, resets on a hit.
Add the suite to `test:heroes`. Run only `mic` + `micplay` suites while iterating; `npm run check:changed` once before the push. One headless-Chromium smoke run with a fake mic device for the setup overlay (screenshot), not a test suite.

## Order of work (stop points)
1. `mic_play.js` + its test, green.
2. Wire 2D `rhythm.js`; wire 3D `mg_rhythm.js`; script tags.
3. Setup overlay + first-run card + Settings entry.
4. One Chromium smoke check, `check:changed`, commit, push, PR, merge.

Out of scope for this pass: freestyle scoring, clip sharing, new detector DSP.
