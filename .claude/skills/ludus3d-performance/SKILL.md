---
name: ludus3d-performance
description: Ludus Maximus 3D only. Performance, tiers and mobile robustness for js/main.js and js/post.js: measured draw calls and triangles per tier and scene, how to measure and profile, device tier auto-detect, dynamic resolution, shadow-caster and crowd LOD, context loss, visibility pause, reduced motion, leak checks. Read before adding anything that costs draw calls or triangles.
---

# Performance and mobile robustness (Ludus Maximus 3D)

Budgets (ART_BIBLE): desktop <= 300 calls and <= 750k tris, mobile <= 150 calls and <= 300k tris. Numbers below are `renderer.info` after one composed frame (scene + shadow pass + post), software GL, 3 s of fight/hub time.

## Measured (after the pass; before in brackets where it changed)
| scene (390x800) | low calls / tris | medium | high |
| --- | --- | --- | --- |
| hub, 12 gladiators (5/8/12 shown by tier) | 48 / 175k (50 / 254k) | 68 / 232k (68 / 308k) | 76 / 371k |
| fight 1v1 | 69 / 199k (83 / 232k) | 84 / 232k (96 / 283k) | 91 / 343k |
| fight 2v2 | 101 / 206k (129 / 240k) | 119 / 240k (142 / 291k) | 132 / 351k |
| fight 3v3 | **129 / 213k** (169 / 248k) | **149 / 247k** (182 / 298k) | 166 / 358k |
1100x650 is +3 to +9 calls (bigger viewport shows more). Tiers differ little in tris because terrain, bowl stone and gladiators are fixed cost; the knobs are crowd instances, shadow casters, olives and post.
Low and medium 3v3 and the hub meet the mobile budget; high is far inside the desktop budget.

## Where the cost is (3v3 low, scene 179k + shadow casters 69k)
crowd 90k (now ~66k) , arena stone 20k (also casts: 20k again in the shadow pass), unnamed arena parts 37k, 6 gladiators ~1k tris each but **11 meshes each** (flap x2, cloth, skin, eye, hair, leather, steel, trim, shield, metal). Each caster mesh is drawn twice (shadow pass + main), so calls, not tris, are the fight bottleneck: 6 rigs = ~130 calls before trimming.
Hub low: olive grove instance mesh 58k (casting: 117k with the shadow pass), terrain 45k (150x150 grid), foliage 9.6k.

## What the pass changed
- `post.trimShadowCasters(root, tier)` (called by fightview after createGladiator): eyes and flaps never cast; medium also hair/trim/plume; low also steel/net. Saves ~6 calls per rig on low (about 40 on 3v3), nearly invisible at 1024 shadow maps.
- `createArena({lite})` (low and medium): crowd body 5-gon, octahedron head, 3-gon arms = 40 tris per spectator instead of 60; torches, braziers and banner masts stop casting. Low density 0.45 and medium 0.7 are unchanged.
- `createLudus({terrainSeg, farShadows})`: hub passes terrainSeg 112 on low (24k tris instead of 45k) and `farShadows` only on high (olive groves do not cast on low/medium: -58k tris and one call per pass). Visually checked at 390x800 and 1100x650.
- Do not set `renderer.info.autoReset` back to true: main.js resets once per frame, the stats include the whole frame.

## Tier selection (`detectTier`, post.js)
`?tier=low|medium|high` wins. Otherwise: phones/tablets (coarse pointer, touch UA, iPadOS Macintosh UA): low when <= 4 GB or <= 4 cores or weak/unknown, medium when (iOS or >= 6 GB) and >= 6 cores. Desktops: high (medium only with <= 2 cores or <= 2 GB). Headless/CI keeps high, so screenshots do not change. The governor writes a 14 day cap (`localStorage ludus3d_tier_cap` = `tier:timestamp`) when it demotes, so the next load starts at a tier the device held; `?tier=` ignores and never writes it. Clear it with `localStorage.removeItem('ludus3d_tier_cap')`.

## Dynamic resolution (`createDynamicRes`)
target 55 fps (18.2 ms), slow when the 10% EMA exceeds 22.7 ms for 20 frames: scale -0.1 (floor 0.55), 150 further slow frames at the floor demote the tier (main.js `applyTier` also moves hub, arena density and saves the cap). Recovery compares against the best frame time seen (a 60 Hz display never produces a frame under 16.7 ms, so the old absolute 14 ms test could never pass and the scale never came back). Recovery waits 240 fast frames; a drop within 600 frames of a recovery doubles the wait (max 3840) so a borderline device stops oscillating. `dyn.reset()` ignores 45 frames after scene switches and tab resume. Simulated: steady 60 Hz stays 1.0, one 120 ms hitch no change, heavy scene (30 ms at 1.0, 15 ms at 0.7) settles at 0.7, a 5 s stall recovers to 1.0 in about 6 s, 120 Hz stays 1.0. Weakness: a device locked to 30 fps (iOS low power mode) looks slow and is stepped down to the floor and low tier.

## Mobile robustness checklist (all verified with `tools`-style Playwright touch tests)
- HUD layers (`.lx-hud`) used to swallow every hub tap, drag and pinch because index.html has `#ui > * { pointer-events: auto }`. Fixed in ui.css (`#ui > .lx-hud { pointer-events: none }`, children auto). If you add a full-screen layer to `#ui`, give it `pointer-events:none` inline.
- Touch: hub one-finger orbit, two-finger pinch (dist 122.9 to 45.8 in the test), tap pick, fight ult buttons (`touchscreen.tap` fires click). `gesturestart` is cancelled (iOS page zoom), `#ui` has `touch-action: manipulation`.
- Safe areas: `--lx-sat/sab/sal/sar` in ui.css cover HUD, nav, sheets, toasts; the context overlay uses them. No horizontal scroll (scrollWidth == innerWidth at 390 and 800 wide, `overflow-x:hidden`).
- Resize/orientation: resize, orientationchange (+250 ms, +900 ms for iOS stale sizes) and visualViewport resize are coalesced into one rAF; no-op when the size is unchanged. Rotation 390x800 -> 800x390 -> back keeps aspect, canvas and drawing buffer in sync.
- Context loss: `webglcontextlost` preventDefault, loop halts, `.lx-perf-ctx` overlay (friendly text, Reload button after 8 s); `webglcontextrestored` hides it, forces resize, resets the governor, resumes. Test with `__LM3D.loseContext()` then `__LM3D.restoreContext()` (the extension is fetched before the loss: `getExtension` returns null on a lost context).
- Visibility: loop halts while hidden (rAF cancelled, `dt` re-based on return); audio.js suspends and resumes its own AudioContext. main.js no longer stops the music on hide (it never restarted).
- Frame errors: rAF is re-armed before the frame body and the body is try/catch'd (5 logged), so one throwing frame cannot freeze the game.
- Reduced motion (OS setting or the in-game `lx-reduce-motion` body class): `post.reducedMotion` (no CA pulse, zoom blur, heat haze), `fightView.feel.state.reducedMotion` (shake 0.25x, no FOV punch), hub idle drift off, CSS animations/transitions collapsed (`@media (prefers-reduced-motion)` in the `.lx-perf` block).

## Leak check (10 fight -> hub cycles, 3v3, low, forced GC)
geometries 66, textures 38, programs 57, DOM nodes 184, JS heap 38 to 40 MB: identical from cycle 2 to cycle 10 (cycle 1 builds the fight scene lazily: +30 geometries, +19 textures). Recipe: `?new=1&empty=1&manual=1&notut=1&tier=low`, add glads, loop `startDemo({team:3}); advance(3); game.returnToHub(); advance(.5)` and read `renderer.info.memory` + `programs.length` (stats() prints both). Rig disposal is `rig.dispose()` in `FightView.dispose`; arena, FX and portraits persist by design (one instance each).

## Profiling recipes
- Counts: `node tools/ludus3d_shot.mjs "<url>?demo=1&team=3&tier=low&manual=1" /tmp/x --w 390 --h 800 --at 3` prints stats JSON. Hub: `?new=1&rich=1&empty=1&manual=1&notut=1` (tutorial cards block taps otherwise).
- Per-mesh breakdown: traverse `__LM3D.post.composer.passes[0].scene`, sum `index.count/3 * (instanced ? count : 1)` by `name@parent`, mark `castShadow` meshes (they cost again in the shadow pass).
- Software GL ignores fill cost, so use counts, not ms.

## Pitfalls
1. InstancedMesh with `frustumCulled=false` and `castShadow` re-draws every instance in the shadow pass.
2. New small meshes on rigs: name them, then add the name to `NO_CAST` if they should not cast on low.
3. Do not `await startDemo()` in tests: the promise resolves when the fight ends.
4. Every added caster is 2 calls on high; check the 3v3 low number (<= 150) after touching gladiators, gear or the arena.

# Update: fight QoL pass (draw calls, warm-up, spikes, GC, power)

## Draw calls, 3v3 390x800, max over a 30 s fight (software GL, `peak` sampler = advance 0.5 s, read `renderer.info`)
| tier | before (same sampler, old behaviour emulated) | after | note |
|---|---|---|---|
| low | 144 (lead measured 147) | **131** | shadow casters drop `leather` |
| medium | 151 (lead measured 160) | **136** | bloom 5 to 3 mips (-4 passes), casters drop `leather` + `steel` (-11 shadow calls), idle fx meshes hidden |
| high | 166 | 169 | unchanged on purpose (casters, 5 mips); far inside the desktop budget of 300 |
- `post.TIERS.*.mips`: medium runs `UnrealBloomPass.nMips = 3` with factors `[1, .85, .7, 0, 0]` (setTier re-applies). Check the glow visually if you touch it.
- fx: rings, slashes, ribbons and numbers draw only while something in them is alive (`ringAlive`/`slashAlive` mirror the shader dead tests, `gEnd` for numbers). Idle fx = decals + debris only.
- Still unmerged (not in my files): arena unnamed meshes (9) and flames (2), rig flaps / plumes (2 calls each).

## Shader warm-up (`FightView.warm()`, called by main.js behind the boot overlay, `?nowarm=1` skips it)
Builds a rig of every style, the gib mesh (`gore.warm`), every pooled fx mesh (`fx.setWarm`), makes every hidden mesh visible once (theme / weather props), compiles with the composer render target bound (programs are keyed by it), then draws one frame (shadow depth, bloom, grade, output, decal texture). On high it also builds every arena theme's lazy dressing. Gotchas learned:
- three destroys a program when the last material using it is disposed. Real rigs are disposed after every fight, so the warm rigs are KEPT (`warmRigs`, detached, not disposed) to keep their programs alive for the whole session.
- Measured: programs after warm 62 (high), 52 (medium); a whole fight adds 0 on high, 2 on medium/low (hay and horizon of themes that are only built lazily; memory forbids pre-building them on phones). Software GL: warm 3 to 10 s, a real GPU compiles in a fraction. `window.__LM3D` is published after the warm, so tools never race it.
- Keep `visible=false` props out of the warm with `userData.noWarm = true`.

## Frame spikes: `__LM3D.stats().spikes`
`{frames, avg, p95, max, spikeMs (25), spikeCount, worst, recent[{n, work, gap, scene, phase, cause: 'compile'|'advance'|'', programs}]}`. `work` = CPU ms of frame + render submit; a frame that created programs is tagged `compile`. `resetSpikes()`, `setSpikeMs(ms)`. Ignores 45 frames after resume.

## Decal canvas and coverage
- Full 2048 upload = 16 MB; now `fx.markDecals(x, z, r)` marks 512 px tiles (4x4, 2x2 on 1024) and `uploadDecals` pushes at most 2 dirty tiles per step with `texSubImage2D` (1 MB each; only tiles ever painted are re-marked by the global dry pass). First upload and `clearDecals` use `needsUpdate`. `fx.decalStats {tiles, full, ms}`; a 40 s 3v3: 239 tile uploads, 1 full. Software GL cannot show GPU upload time; the saving is 16x fewer bytes per update.
- gore coverage cap is now analytic (32x32 grid, union of stamp areas, x1.35): the old `drawImage` + `getImageData` of the decal canvas every 1.5 s was a GPU readback stall (one 2.4 s hitch seen in software GL). Calibrated against the canvas measure: 0.24 vs 0.195 at 40 s.

## GC / allocation (Chrome heap sampling incl. collected objects, 300 frames of 3v3 medium)
149 KB/frame before this pass is the figure of the whole frame (about 4.5 MB/s at 30 Hz, a minor GC every few seconds). Top: rig.js `update` 13 KB (not mine), gore hook 9 KB (double fields of pooled droplets), fightview `syncFighters` 5 KB + `stepPush`. Fixed in fightview: plate head vectors, kickup temporaries, pooled director unit list, last-stand without `filter`. Recipe: `HeapProfiler.startSampling` with `includeObjectsCollectedByMajorGC/MinorGC: true`, `--js-flags=--expose-gc`.

## Battery / thermal (main.js `PWR`, `fpsCap`)
30 fps when the governor demoted to low, battery under 20 % and discharging, the hub idle 5 s without input (no modal open), or `?fps=30`. A capped loop skips `dyn.tick` (resets it) so the governor never reads 33 ms as slow. `stats().fpsCap`.

## Startup
47 JS files, 2.1 MB uncompressed (three 675 KB, rig 199 KB); vendor/jsm already holds only the 5 addons used. Added `modulepreload` for the heavy static chain (flattens the serial import discovery), boot messages per stage. Hub is already a dynamic import. Ready (software GL, low) about 9.5 s of which warm 3 s.

## Leak check (10 fight -> hub cycles, 3v3 low, forced GC): geometries 130, textures 47, programs 72, DOM 161, heap 40 MB, identical from cycle 1 (the warm builds everything up front).

# Update: optimisation pass 2 (CPU, GC, draw calls, memory, load) with before/after

All numbers: software GL (Chromium swiftshader), 390x800 unless said, tier shown, `?manual=1`. GPU time is meaningless here, so the work targets CPU, allocations, draw calls, bytes and load. "Before" = the tree at the start of this pass (the figures of the pass above). The measuring scripts were throw-away Playwright files (CDP `Profiler`, `HeapProfiler.startSampling` with collected objects included, `renderer.info`, an `onBeforeRender` / `onBeforeShadow` hook that lists what is really drawn); the recipes are written down per section so they can be rebuilt.

## 1. CPU (3v3 medium, 20 simulated s = 600 `advance` frames, update only, no render)
| | before | after |
|---|---|---|
| game.frame CPU per frame | 6.9 ms | 2.9 ms |
Top self-time before: `syncFighters` 1199 ms (26 %), `updateMatrixWorld` 243, `el.set` (HUD bar) 202, rig `step` 111, `update` 101, `collide` 76. Fixed:
- **Forced layout in the nameplates** (the real top offender): `placePlate` read `canvas.clientWidth/Height` after the previous plate had written its style (a layout flush per fighter per frame) and `measureHud` ran `getBoundingClientRect` every 20th plate. Now the canvas size is cached (reset in `resize`), `measureHud` is time based (350 ms, or every 120th plate), plate position / opacity / scale are only written when they changed, the HP bar only when the value changed (and at most 10x per second per fighter, each damaged write forces a layout inside ui_kit), cooldown rings only when the ring visibly changed. `syncFighters` self time 1199 ms to 42 ms.
- Verlet cloth: row widths cached in a `Float64Array` (a `widthFn` closure call per pair per iteration boxed a double each time), index maths inline, leg capsules for the flap collider measured once per step (`prep`) instead of per vertex per iteration, normals computed by `ClothGrid.gridNormals` (three's `computeVertexNormals` allocates six Vector3 per call).
- Cloth LOD: `rig.lod = 1` when a fighter is more than 30 m from the camera (fightview sets it every 8th frame): cloth steps every other frame with the summed dt.
- Animator: `keyClip.sample` mixes two pre-densified flat poses (was two sparse `for in` applies), attack LAG loop on flat arrays, `emissive` of the 13 materials is only rewritten while a flash or glow runs, joint quaternions are written without three's change callback (`qCopy` / `qSlerp`, the joint Euler angles are never read; the callback re-derived Euler angles and boxed doubles on every joint, every frame).
- Hub ambient life was already negligible (0.05 ms per frame: only characters within 95 m update).
- Where the rest goes (3v3, ms per frame of the 2.9): rig.update x6 1.3, cloth 0.45, fx 0.3, director 0.05, HUD DOM 0.1.

## 2. GC / allocations (3v3 medium, heap sampling incl. collected objects, KB per frame)
| | before | after |
|---|---|---|
| cold (300 frames after 4 s) | 113 to 135 | 83 |
| steady (after 3 to 4 warm fights, JIT stable) | 99 | 78 to 84 (varies by fight) |
| gore droplet hook | 17 (cold) / 4.7 | 5 / 1 |
| `VerletGrid.step` + normals | 2.4 + about 13 | 0.1 |
| hunt (pride) cold | n/a | 87 |
**The goal of 40 KB was not reached.** What was learned (use it): V8 allocates a HeapNumber (16 B) for every double that crosses a call that is not inlined, and for every double result of a call that is not inlined. Tiny helpers called with doubles (`lerp`, `clamp` through `Math.max/min`, `Pose.set(j, x, y, z)`, `Math.hypot`, `Vector3` getters, a `widthFn` closure, `layer.putS(12 doubles)`) are the allocation sources, not objects. Fixes that worked: write straight into typed arrays in the hot loop (gore: 12 KB to 1), inline `lerp`/ternary clamp (`rig.js` `clamp` is now a ternary, `Pose.mix` inline: update 10.4 to 5 KB in a move-only test), `Math.sqrt(x*x+y*y)` instead of `Math.hypot`, no closures / array literals / string concatenation per frame (hoisted index tables in rig.js and beast.js), flat arrays instead of Map or `for in` iteration per frame (beast clip channels, fightview fighter list), xorshift instead of `Math.random` in fx particles. `%GetOptimizationStatus` shows Animator.update TurboFan-optimised yet it still allocates about 2 to 3 KB per call (12 to 20 KB per frame for six rigs); the cause was not found (the additive and action layers are not it: skipping them saves about 5 KB).
Remaining top (KB per frame, steady): Animator.update 12 to 20, director.js 8 to 13 (arrays and object spread per frame by design: `units.map({...u})`, `basis` is now memoised), `syncFighters` 6.5, fx `Layer.step` 4, `updateEmitters` 2.8, `postIK` 2.6, gore jets 1.6.

## 3. Draw calls (peak over 14 s, 390x800)
| scene | tier | before | after | target |
|---|---|---|---|---|
| fight 3v3 | low | 131 | **115** | <= 120 |
| fight 3v3 | medium | 134 | **120** (118 to 120 over 29 s) | <= 130 |
| fight 3v3 | high | 169 | 152 | |
| hub, 12 gladiators | low | 46 | **39** (40 when it rains: the rain lines are one more call) | <= 40 |
| hub | medium / high | 65 / 76 | 62 / 76 | |
Hunts (medium, 10 s): lion 58, wolves 65, boars 65, bears 81, pride 83, nemean 97, menagerie 102.
What merged (count each x2 for casters because the shadow pass redraws them):
- Arena: ring archivolts, engaged columns and the two gate frames are baked into the `stone` mesh (they share its material); `arch_voids` + windows + niches are one MeshBasic mesh; torches, braziers and bronze clipei are one `bronze_fittings` mesh; the two gate tunnels are one `gate_tunnels` mesh; flames and halos are ONE instanced mesh with an `aKind` attribute (`createFlames` returns `flame` and `glow` both pointing to `flames_all`). 14 calls fewer, costs about 3.5 MB of CPU geometry (baked, not instanced). `envfx.bakeInstances(im)` does the baking.
- Rigs: the front and back loin flaps are one mesh (`mergeCloths(rig, list)` in rig.js: the grids keep their own geometry objects but their position / normal arrays are views into one shared buffer, so `detachPart`, the hub bake and the gore props still work). -4 main + shadow draws per 3v3.
- Hub: aqueduct + temple + forum columns + the Colosseum seating cone are one `city_static` mesh (the cone was a BackSide mesh; flipped winding and normals it shades identically as a FrontSide part); empty smoke / spark Points are hidden (an empty Points is still a call); on LOW the gladiators stop casting shadows (5 skinned shadow draws) and get a soft blob each, appended to the env's `blobshadows` instanced mesh (same call as the tree blobs). Compare a screenshot at 390x800: the figures are still grounded, the shadow is a blob instead of a silhouette.
- Pitfall: `onBeforeRender` also fires for objects three then skips (instance count 0 or an empty Points); `renderer.info.render.calls` is the truth. `onBeforeShadow` lists the shadow-pass draws.
- Not merged: the nine skinned parts per rig (skin, cloth, leather, steel, trim, eye, hair, metal, shield: separate shader patches), the three hub rings, hub smoke vs sparks (different shaders), the Colosseum facade (own texture and DoubleSide).

## 4. Memory
Texture sizes (RGBA + mips estimate, uploaded textures):
| texture | before | after |
|---|---|---|
| hub courtyard floor, low / medium / high | 1536x1250 10.0 MB | 1029x838 4.5 MB / 1290x1050 7.2 MB / unchanged |
| hub Colosseum facade, low / medium / high | 2048x768 8.2 MB | 1372x515 3.7 MB / 1720x645 5.8 MB / unchanged |
| arena sand decal, medium | 2048x1350 11 MB | 1536x1012 6.2 MB |
Both big hub textures use a `k` scale: the same picture is drawn into a smaller canvas (`ctx.scale(k, k)`), so nothing else changes. `createLudus({ texK })`, hub passes 0.67 / 0.84 / 1. Textures the page references at low (CPU-side estimate, the hub and the fight scene both exist after boot): hub screen 41.9 MB, 3v3 screen 53.2 MB (fx decals 4 MB, sand map + bump 10.9 MB, arena decal 2.7 MB, stone, banners). High: decals 16 MB + arena decal 10.8 MB are the big ones (kept: blood sharpness).
Leak check, 10 fight to hub cycles, 3v3 low, forced GC: geometries 115, textures 47, programs 70, JS heap 44.8 to 45.5 MB, identical from cycle 1. (The DOM count grows in this recipe because `returnToHub` is called before the VS splash timers fire; it is the splash waiting for its real-time timeout, not a leak.) Rig geometry is NOT shared between rigs of one style (palette, build and gear differ per gladiator, and `items` keep their parts for `detachPart`); a rig is about 1k tris, so it is cheap.

## 5. Load (title path, ?tier=low, software GL)
| | before | after |
|---|---|---|
| JS requests / bytes | 51 files / 2203 KB | same (static copy: Cloudflare compresses) |
| all JS downloaded, 80 ms RTT | 3.5 s (median) | 0.45 s |
| all JS downloaded, 160 ms RTT | 3.97 s | 0.65 s |
| `window.__LM3D` ready, no warm, 80 ms RTT (median of 5) | 4.4 s | 4.07 s |
| ready, 160 ms RTT (median of 3) | 5.0 s | 4.76 s |
| ready on a local server, with warm | 9.2 to 10.0 s | same |
What changed: `index.html` now preloads the whole static import graph (depth 2 to 5: ui_kit, flow, envtex, envfx, env_ludus, beast, director, feel, sky, title, tutorial, ceremonies, portrait, photo, the postprocessing addons, BufferGeometryUtils) plus the hub's own `buildings.js` and `screens/more.js`; before, `buildings.js` was fetched only after FightView had been built (t = 1.9 s) and `more.js` at 4.2 s. `main.js` is NOT preloaded on purpose: the structure test finds the first `js/main.js` in the file and wants it after the core scripts (the preload scanner already fetches the module script). `build.js` output checked: `dist/ludus_maximus_3d` has the same 70 files as the source, `lab/` is empty (DEV_ONLY), every href in index.html exists.
Where the software-GL boot goes (CPU profile, 10 s): three.js 6.3 s (shader compiles and render target allocation, GPU artefact), `envtex.js` procedural textures 2.0 s (REAL CPU: 12 textures, `bake` 1M-pixel loops: sand 1024 = 560 ms, stone 512 = 120 to 160 ms), `createArena` 1.5 s and `createHub` 1.5 s (mostly those textures), warm 3.9 s (mostly shader compiles), audio 0.3 s. Done: identical stone parameters are generated once (`makeStoneTexture` memo, about 160 ms in the hub path). Tried and dropped: a closure-free `tnoise` (output identical, 4 % faster, kept). Not done (ideas ordered by value): move `envtex` generation to a Worker (OffscreenCanvas, transfer ImageData) or cache the PNGs in IndexedDB (repeat visits skip about 2 s of CPU); build FightView lazily on the first fight (game.js owns `init0`, it was off limits) and warm in idle time after the title is shown (the warm swaps `post.setScene` and the camera, so it must block the loop or the first fight must wait for it); defer `audio.ensure()` (170 ms) until the first gesture.

## Recipes (rebuild the scripts from these)
- Heap per frame: launch with `--js-flags=--expose-gc`, `gc()`, `HeapProfiler.startSampling({samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true})`, `advance(10)`, `stopSampling`, sum `selfSize` per `callFrame` / frames. For the steady figure run `startDemo({team: 3}); advance(30)` three or four times first, then `startDemo` again, `advance(5)`, then sample. `performance.memory` deltas under-count (allocation buffers are accounted late): use the sampler.
- Draw calls: `renderer.info.render.calls` after `advance`; to see which meshes: set `onBeforeRender` and `onBeforeShadow` on every mesh, `renderer.info.reset(); post.render(...)`. To see what a mesh costs: set `visible=false` per mesh and compare `calls`.
- Load: Playwright `page.route('**/ludus_maximus_3d/**', r => setTimeout(() => r.continue(), 80))` simulates latency; read `performance.getEntriesByType('resource')` for the last JS `responseEnd`.
