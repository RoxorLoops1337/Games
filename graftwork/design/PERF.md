# Graftwork performance: measure, then fix

Harness: `node tools/graftwork_profile.mjs` (real Chromium via playwright, phone viewport 1000x462, DPR 2, touch, CPU throttle 4x and 6x, Slow 4G for the load runs). It writes frame time p50/p95/p99, dropped frames, long tasks, JS heap, a GPU/raster proxy (devtools trace: GPUTask + RasterTask + decode), decoded image bytes, canvas backing bytes, canvas ops per frame (separate unthrottled pass so the op wrappers never disturb the timings) and the load metrics (bytes, time to interactive title, painted title scene, Ward ready, warm reload). Useful flags: `--flags smooth=0,faceLod=0` (A/B a round 2 lever in one tree, see `ui/perf_flags.js`), `--dump '<js expr>'` (evaluate in the page after the window), `--scenarios a,b`, `--throttle 4`, `--graphics auto|high|low`, `--cache-headers` (serve the `_headers` rule for art), `--root <dir>` (profile another copy of the repo, e.g. a `git archive` of an old commit), `--merge`, `--soak N` (leak soak), `--cpu <scenario>` (self-time sampling profile), `--quick`, `--verbose`. Results: `PERF_BASELINE.json` (commit 05a40134, before the phone/perf work), `PERF_AFTER.json` (this tree, Graphics = High), `PERF_AFTER_LOW.json`, `PERF_AFTER_AUTO.json`, `PERF_SOAK_AFTER.json`. Round 2: `PERF_R2_BEFORE.json` (the round 1 tree, re-measured) and `PERF_R2_AFTER.json` (this tree, plus the A/B runs, the unthrottled CPU profiles and the before/after pixel diffs).

Read the numbers with care. This sandbox has no GPU (SwiftShader software GL and CPU raster, 4 shared cores), so canvas drawImage, WebGL upload and compositing run on the CPU and everything is 5 to 20x slower than a phone. Ratios between runs are meaningful (each JSON carries `calib_ms`, a fixed JS loop, 505 vs 509 ms for the baseline and the after run, and `loadavg1`), absolute fps are not. A real Android phone with GPU raster will sit far above these numbers.

## Round 2: what was measured, what was fixed, what was not

Same harness, same sandbox, CPU throttle 4x and 6x, DPR 2 and 3, mobile UA, Graphics = High (tier full, nothing degrades). The "before" is the round 1 tree (HEAD 3467deff) run again today next to the new tree (`calib_ms` 474 to 521 for the 4x runs of both, 738 to 847 for 6x), so the comparison does not borrow the old numbers. fps / frame p95 ms:

| scenario (4x, DPR 2) | before | after | fps |
|---|---|---|---|
| title idle | 2.8 / 386 | 3.9 / 291 | +39% |
| Ward, 12 rooms | 2.1 / 550 | 2.9 / 388 | +38% |
| combat, 3 enemies | 3.5 / 368 | 4.4 / 332 | +26% |
| graft screen | 2.2 / 473 | 3.0 / 377 | +36% |
| shop | 2.2 / 506 | 2.9 / 373 | +32% |
| deck view, 40 cards | 1.6 / 781 | 2.2 / 606 | +38% |

| 6x, DPR 2 | before | after | fps |
|---|---|---|---|
| title idle | 2.1 / 496 | 2.8 / 431 | +33% |
| Ward | 1.5 / 742 | 2.1 / 553 | +40% |
| combat | 2.3 / 530 | 2.8 / 450 | +22% |
| graft | 1.6 / 727 | 2.3 / 476 | +44% |
| shop | 1.6 / 690 | 2.2 / 524 | +38% |
| deck view | 1.1 / 1097 | 1.7 / 682 | +55% |

| 4x, DPR 3 (backing 2464 x 1386) | before | after | fps |
|---|---|---|---|
| title idle | 1.3 / 848 | 1.9 / 599 | +46% |
| Ward | 1.0 / 1060 | 1.5 / 811 | +50% |
| combat | 1.5 / 789 | 1.6 / 740 | +7% |
| deck view | 0.8 / 1423 | 1.1 / 1049 | +38% |

JS time per tick (js p95, 4x DPR 2): title 213 to 137 ms, Ward 396 to 229, combat 199 to 155, graft 315 to 208, shop 336 to 213, deck 632 to 384. Canvas backing and decoded image memory are unchanged (deck canvases 79 to 75 MB). These are sandbox numbers (software raster and software GL), so only the ratios mean something. We are still far from a smooth frame here (3 to 4 fps), the honest statement is "about a third faster at High", not "smooth": a GPU phone will be much further ahead of this box, and Auto still drops to lite below 30 fps.

### Where the gain came from (A/B in one tree, 4x DPR 2, one lever switched off)

| lever | measured | verdict |
|---|---|---|
| imageSmoothingQuality policy (`ui/smoothing.js`) | off (the old 'high' on every draw): title 2.8, Ward 2.1, combat 3.6 vs 3.4 to 3.9, 2.8 to 2.9, 4.2 to 4.4 on | all of the fps gain above. 'high' only where a source of 96 px or more is shrunk by more than 2x (mipmaps: no shimmer), and where a 512 px or bigger backdrop is magnified 1.15x or more (bicubic is sharper than bilinear). Everything else 'low'. |
| smoothing for upscales (`smoothUp`) | 1.15 vs 0: combat 4.2 vs 4.2, Ward 2.6 vs 2.8 | kept on (about 0 to 7 percent for the sharper backdrops the owner asked for) |
| card face buckets (`art/face_lod.js`) | off: deck 2.2 vs 2.1, shop 2.8 vs 2.9 | no fps change here, kept for what it does: zoom cards render at device resolution (sharper, see below), a deck sized face is a quarter of the pixels of the old one, and the face cache has a pixel budget instead of a count |
| text width cache (`ui/text_metrics.js`) | off: shop 3.0 vs 2.9, deck 2.1 vs 2.1; measureText per frame shop 279 to 6, deck 136 to 1, Ward 109 to 0, title 41 to 0 | no fps change (measureText is cheap here), kept: it removes the per-character calls from every frame |
| room layer cache, buckets per room (`ui/layer_cache.js`) | off: Ward 3.0 vs 2.8 | no change in the harness (the camera does not move in it); it matters for an eased zoom, covered by the policy tests: a there-and-back zoom bakes at most 3 buckets and bakes nothing while the zoom is still moving |
| transition snapshot on demand | the full-canvas copy was 25 to 45 ms per call (unthrottled), every 4th frame, 369 to 675 ms of a 10 s window (about 5 percent of a title frame) | now one copy per screen change; below the noise of an fps run |
| shared lamp sprites for card shadow, rim and sheen (tried) | card ops per draw 123 to 58, but deck 2.3 vs 2.1 | no gain, and it quantised the lamp: reverted |

The CPU sampling profile (unthrottled 10 s, `cpu_*`): the game's own functions are still under 1 percent each. Self time is native: title `drawImage` 46.8 to 31.3 percent, `texSubImage2D` 8.5 to 4.9; Ward `drawImage` 35.4 to 26.5, `texSubImage2D` 15.6 to 10.2; deck `drawImage` 24.5 to 17.8, `texSubImage2D` 26.2 to 19.9 (the rest is `(program)`: raster, compositing, software GL). The sampling window is fixed in time, so shares move when frames get cheaper; per frame the first two lines fell by a third to a half.

What the post pass costs (same harness, 4x): Effects quality Off (no WebGL post) title 7.7 fps vs 3.4 (2.3x), deck 3.6 vs 2.1; bloom only off: title 4.9, deck 2.5; RGBA8 instead of half float bloom buffers: title 3.8 (12 percent, not adopted: precision, and it only helps a software GL). So in this sandbox the post is 55 percent of a title frame: the bloom passes about 30 percent, the upload plus the composite pass the other 25. On a GPU the upload is a GPU copy and the passes are free, so do not read this as a phone number.

### Dirty frames, the upload, and idle pacing (what exists now, and what does not)

- `app.staticFrame` is now defined: `ui/frame_state.js` (pure) says a tick may be skipped, with no 2D redraw and no WebGL upload, when input, tweens, timers, ripples, transitions, post effects, tooltips are quiet for 2 frames in a row (the frames after a change are still painted) AND every screen on the stack declares `still(app)`. Any input, a pointer resting on the stage, `markDirty()` (screen change, resize, asset arriving) wakes it; a repaint every second is the safety net. Measured in real Chromium on a screen that is still: 6 s window, skipping off 56 draws and 56 `texSubImage2D` uploads (9 fps), on 6 draws and 6 uploads (the loop runs at 54 fps, the screen costs nothing).
- Honest limit: no shipped screen declares `still` yet. I checked every screen for pixel changes with no input (hash of the canvas five times, 350 ms apart): all of them change, also with Reduce motion on, because the lamp pendulum on every card, candle flicker, motes, breathing and the brass shimmer are wall-clock animations. The Codex over a still title is the only static case (Reduce motion). Declaring `still` on a screen means freezing those, which changes the look, so it is left to the owner; the machinery, its tests and the `app.noSkip` switch are there.
- Content-aware cheaper path (this is what idle screens use today): `calm(app)` on a screen lets the frame governor idle it at 30 fps after 4 s without input, like the title already did. Declared on the Ward (only while nothing moves by itself: no walking hero, banner, transition, die, rest of day, particles), deck view, Codex, Archive, Wardrobe, Settings, Pause. A 30 fps idle tick halves the 2D draw and the upload together (checked in the browser: the governor reports `capped` in the idle Ward). Not on combat, reward, graft, shop, forge, event, map: they run sequences with no input.
- Not done on purpose: uploading a downscaled copy for bloom. The composite already samples the full-resolution texture once and bloom already reads from half-resolution targets filled by one threshold pass, so there is one full-size upload per frame and nothing smaller to upload without softening the main image. A dirty-rect upload needs every screen to report the rects it touched.
- Finding, not changed: `post.js autoQuality` drops the post tier when the mean frame is over 24 ms (low to off) and only rises again when the mean is under 12 ms, which a 60 Hz display never reaches (16.7 ms). After one slow stretch the bloom and grade stay off for the rest of the session on a 60 Hz phone, even at Graphics = High. It is a one line change (compare against the display interval) but it changes what players see, so it is the owner's call. I hit it in the harness: a screen change at 3 fps switched the post off.

### Caches

- Card faces: baked at a bucket (0.5, 0.75, 1, 1.5, 2, 3, 4 px per card px) chosen from the real transform scale at the draw, the smallest not below the device pixels. A deck grid card (0.64 device px per card px) bakes at 0.75, a hand card on a DPR 2 phone at 1.5, a zoom card at DPR 2 at 2 and at DPR 3 at 3 (before: 1.5 for everything, so a zoomed card was upscaled 1.4x to 2.1x and visibly soft). Sizes above 1.5 are "big", at most 6 are kept; the face LRU has a pixel budget (24 M px, what 110 faces held before) and at most 2 builds per frame, over that a cached neighbour is drawn so a burst of new sizes never hitches. The parallax layers follow the face bucket. Card backs stay at 1.5.
- Ward room layers (and the title rooms): up to 3 buckets per room, a bucket already baked is a hit when the zoom comes back, builds are limited to 3 per frame, and while the zoom is moving an existing bucket within 2x is drawn instead of baking a new one. Already cached before this change and left alone: combat backdrop (back, front, reflection bakes), panels and buttons (chrome textures), the grade sprite, enemies and heroes, mip chains.
- Not cached: the lamp dependent live layer of a card (tried, no gain), HP bars and the combat HUD (a few percent of the ops, text and rects).

### Visual differences (before vs after, deterministic capture: frozen clock and RNG, 24 ticks, same scene)

Mean absolute difference per pixel (0 to 255) and PSNR, DPR 2 / DPR 3: title 0.003 (70 dB) / 0.003; Ward 0.7 (39 dB; the left panel shows a toast in one capture only) / 0.07 (59 dB); combat 0.57 (42 dB) / 0.64 (37 dB); deck 1.5 (37.5 dB) / 0.9 (46 dB); shop 2.1 (33 dB) / 1.1 (36 dB); zoom card 0.56 (41 dB) / 0.45 (40 dB). Looking at the crops: card text and frames are the same to the eye (the differences are filter rounding at card edges and a 1 device px shift of some glyphs because a face at another bucket rasterises its text on a different grid); the zoom card at DPR 3 is visibly crisper (ribbon edges and letters). Nothing else changed visually: the transition snapshot is now taken at the moment of the screen change (it used to be up to 3 frames old).

### Round 2 tests

`tests/graftwork_perf2.test.mjs` (pure): the text width cache (keys, repeated strings cost nothing, bounded), the smoothing policy (thresholds, mirrored draws, small sources, the installed drawImage), the dirty-frame logic (every busy reason, settle then skip, wake on input, markDirty, heartbeat, an unmarked screen is never skipped), card face buckets and LRU (ideal bucket for deck, hand and zoom sizes, reuse, build budget, pixel budget, big cap), the room layer policy (hit, stand-in while moving, budget, there-and-back zoom bakes 3 buckets at most), the governor with calm screens, `drawCard` on a transform tracking context (three sizes are three faces, redraws build nothing, burst limited), the frame loop (still screen skipped, woken by pointer, markDirty, tweens, `noSkip`) and `app.text` hitting the width cache. `graftwork_rec_hash.mjs` runs with `faceLod=0` so the card identity guard keeps pinning the original call sequence. `node tests/run_graftwork.mjs`: 65/65.

## Where the time goes

CPU sampling profile (`--cpu`, no throttle, 10 s window): deck view 48% `(program)` (native raster and composite), 26% `texSubImage2D` (the WebGL post uploads the whole 2D canvas every frame), 22% `drawImage`; Ward 51% `(program)`, 29% `drawImage`, 13% `texSubImage2D`; JS functions of the game are each under 0.5%. So the cost is pixels and uploads, not game logic. The levers that matter are: backing-store size (DPR), the WebGL post pass, `imageSmoothingQuality = 'high'` (neutering it alone gave title +25% fps and JS p95 260 to 166 ms), sprite resolution (@2x vs @1x), and frame rate on idle screens.

## Before / after (CPU throttle 4x, 10 s windows)

fps / frame p95 ms. Baseline = commit 05a40134. High = this tree with Graphics High (tier full, identical visuals). Low and Auto = this tree after the controller moved to tier minimal.

| scenario | baseline | High | Low | Auto (settled) |
|---|---|---|---|---|
| title idle 10 s | 6.8 / 181 | 2.8 / 386 | 29.2 / 49 | 29.7 / 45 |
| Ward, 12 rooms, hero + monsters | 4.4 / 275 | 2.1 / 521 | 16.6 / 76 | 11.1 / 292 (incl. convergence) |
| combat, 3 enemies, a turn | 6.3 / 240 | 3.7 / 354 | 18.2 / 80 | 17.5 / 87 |
| graft screen | 4.5 / 241 | 2.1 / 520 | 18.8 / 70 | 16.1 / 78 |
| deck view, 40 cards | 0.4 / 3089 | 1.6 / 755 | 9.6 / 116 | 8.6 / 159 |

6x throttle and the other scenarios (title intro, reward, shop) are in the JSONs. GPU/raster proxy (trace ms in a 10 s window, 4x): baseline title 967, Ward 1319, combat 1686; High 4232, 3802, 6345 (lower fps means the window holds fewer frames but each frame is dearer).

Why High is slower than the baseline: the baseline commit predates the phone-sharpness work that landed in the same tree (not part of this change): @2x sprites on phones (decoded images 5 MB to 11-13 MB on the title, 18 to 72-75 MB in the Ward), `imageSmoothingQuality = 'high'` every frame, and a higher DPR cap. The quality policy is inert at High by design. Auto/Low recover and beat the baseline by 3 to 4x on a device that cannot hold 30 fps.

Ops per frame (canvas calls / drawImage / fillText / measureText), unchanged by the policy at High: title 2215 / 79 / 39 / 41, Ward 3310 / 184 / 96 / 109, combat 3383 / 30 / 88 / 68, shop 4832 / 49 / 82 / 279, deck 8288 / 49 / 167 / 136. Minimal tier: title 1862 / 43. Open item: `app.text` with `tab: true` (core.js `put`/`tabW`) calls `measureText` twice per character per frame (the 140 to 280 measureText in shop and deck); a per-font digit width cache would remove nearly all of it. Left to the owner of the core.js text paths.

Load (cold, Slow 4G, CPU 4x): bytes to interactive title 777 KB baseline vs 799 KB now; title scene painted 11.9 s vs 16.0 s (the @2x kit files are bigger; the scene now waits only for its five rooms instead of the whole kit); Ward ready after entering 2.5 s vs 19.6 s (the baseline fetched the whole kit @1x while the title was up; now the title fetches 5 rooms and the Ward fetches the rest, @2x, 3.6 MB). Total after a Ward visit 1.9 MB vs 5.3 MB. Warm reload (ETag revalidation in both, 10 min `max-age` for art in `_headers` after): 176 requests / 66 KB / title 4.4 s vs 156 requests / 29 KB / 5.2 s (the art requests no longer revalidate within 10 minutes). The extra bytes come from @2x on phones; `assets.lowData` (Save-Data, 2G/3G, 2 GB devices) and the lite/minimal tiers now fall back to @1x.

Leak soak (`--soak 12`, High, unthrottled): heap 12.2 MB at cycle 2, 13.3 MB at cycle 12 (+1.1 MB, plateau), canvases alive 197 to 198 (flat), decoded images flat at 71.7 MB, DOM nodes 387 to 388, listeners 190 to 191. No leak found; the backing canvases are bounded caches (text, backgrounds, kit layers).

## What changed

1. Quality policy, `ui/quality.js` (pure, tested). Settings > Graphics: Auto (default) | High | Low, persisted in `meta.settings.graphics` (`settingsOf` cleans bad values). High = tier full always, Low = minimal always, Auto measures the interval between game ticks (so GPU, raster and compositor stalls count, not JS time) and moves one tier at a time: full, lite, minimal.
   - full: everything as authored (DPR cap 3, WebGL post at the Effects setting, motes, `imageSmoothingQuality` high, @2x on phones, 512 px combat sprites for the hero and bosses).
   - lite: title scene every third frame, no motes, no WebGL post, DPR cap 1.5, smoothing low, @1x, no combat colour filter, transition snapshots every 8th frame.
   - minimal: lite plus DPR cap 1 and idle screens held at 30 fps, smaller decoded-image budget.
   - Hysteresis: drop when half of the last 60 frames are slow (> 1.4x expected, never below 16.7 ms), or at once when the mean of 8 frames is over 70 ms; a lone stall is ignored but three in a row count; a rise needs 12 s at under 4% slow frames and a lock of 15 s since the last drop that doubles each time the higher tier fails, and two failed rises cap the tier. A 3 fps device is judged in about 5 s; tests cover no-flapping (at most 12 changes in 40 slow/clean cycles), 60/120 Hz smoothness, hitches, stalls, expected 33 ms intervals.
   - Debug indicator only with `?perf` in the URL (or `app.perf.debug = true`): tier, mean frame ms, drops/rises, DPR, 30 fps flag.
2. Frame loop (`core.js frame`): the governor holds the title at 30 fps after 4 s without input (any pointer, key, wheel or touch wakes it; entering a screen counts as activity so the sewing intro stays smooth) and always in minimal; a hidden tab stops scheduling rAF and resumes on visibility (audio is suspended too, `audio.js`). Backing store follows the tier through `app.perf.dprCap` in `resize()` (one reallocation per tier change, warm-up hides it).
3. Image pipeline (`assets.js`): `img.decode()` decode-ahead off the main thread (the first drawImage no longer pays a synchronous decode), per-image byte accounting, LRU eviction under a budget (96 MB on phones, 64 in minimal, 192 desktop; never an image drawn in the last 6 s; checked every ~2 s from `main.js`), recipe-scoped kit loading (`kitRecipeSettled`: the title waits for and downloads its five rooms, not all 51 kit files), `lowData` and tier based @1x, 3x combat sprites only when the sprite is drawn above 1.3 device px per @2x px (`combat_art.wantHi`: enemies on a DPR 2 phone keep @2x).
4. Caches: background layer LRU 90 to 56 MB; the procedural-figure colour filter (`ctx.filter`) only in the full tier.
5. `_headers`: `/graftwork/assets/*` is `max-age=600, stale-while-revalidate=86400`. Not immutable: art files have plain names, not hashes (manifest `version` is always 1), so immutable would pin stale art forever. HTML, JS and manifests keep the default revalidation. No service worker: Pages deploys the repo as it is with no build id, so a worker could not be versioned safely against a deploy, and HTTP caching with stale-while-revalidate already gives the repeat-load win (29 KB, 156 mostly cache-served requests).
6. Audio was already voice-capped (24 voices, burst limiter) and disconnects nodes on end; the soak shows no node growth. Only the hidden-tab suspend was added.

Tests: `tests/graftwork_quality.test.mjs` (tier controller, hysteresis, governor policy, Graphics setting persistence and row, eviction, recipe-scoped loading, backing store follows the tier), plus the updated settings click coordinates in `graftwork_ui_title`. `node tests/run_graftwork.mjs`: 64/64.

## Not done / next

- Real-device numbers: run the harness on a GPU machine or a phone over remote debugging; the sandbox cannot show GPU raster. Round 2 gains are ratios from a software raster and software GL.
- A screen that may freeze its ambient animation (`still`) would turn the static frame skip into a real win for idle menus; today only `calm` (30 fps) is used.
- The post tier rise condition (see the finding above).
- Painted-art HTTP caching could become immutable if the art pipeline emitted content hashes into file names.
- Done in round 2 and no longer open: the per-digit `measureText` in tabular text, `app.staticFrame`, the per-frame `imageSmoothingQuality = 'high'`.
