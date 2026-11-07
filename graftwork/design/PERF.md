# Graftwork performance: measure, then fix

Harness: `node tools/graftwork_profile.mjs` (real Chromium via playwright, phone viewport 1000x462, DPR 2, touch, CPU throttle 4x and 6x, Slow 4G for the load runs). It writes frame time p50/p95/p99, dropped frames, long tasks, JS heap, a GPU/raster proxy (devtools trace: GPUTask + RasterTask + decode), decoded image bytes, canvas backing bytes, canvas ops per frame (separate unthrottled pass so the op wrappers never disturb the timings) and the load metrics (bytes, time to interactive title, painted title scene, Ward ready, warm reload). Useful flags: `--scenarios a,b`, `--throttle 4`, `--graphics auto|high|low`, `--cache-headers` (serve the `_headers` rule for art), `--root <dir>` (profile another copy of the repo, e.g. a `git archive` of an old commit), `--merge`, `--soak N` (leak soak), `--cpu <scenario>` (self-time sampling profile), `--quick`, `--verbose`. Results: `PERF_BASELINE.json` (commit 05a40134, before the phone/perf work), `PERF_AFTER.json` (this tree, Graphics = High), `PERF_AFTER_LOW.json`, `PERF_AFTER_AUTO.json`, `PERF_SOAK_AFTER.json`.

Read the numbers with care. This sandbox has no GPU (SwiftShader software GL and CPU raster, 4 shared cores), so canvas drawImage, WebGL upload and compositing run on the CPU and everything is 5 to 20x slower than a phone. Ratios between runs are meaningful (each JSON carries `calib_ms`, a fixed JS loop, 505 vs 509 ms for the baseline and the after run, and `loadavg1`), absolute fps are not. A real Android phone with GPU raster will sit far above these numbers.

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

- Real-device numbers: run the harness on a GPU machine or a phone over remote debugging; the sandbox cannot show GPU raster.
- `texSubImage2D` full-canvas upload every frame in `post.js` (screens could set `app.staticFrame` when nothing moved; nobody does).
- Per-digit `measureText` in tabular text (core.js text paths, other owner).
- Painted-art HTTP caching could become immutable if the art pipeline emitted content hashes into file names.
