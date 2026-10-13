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

# Update: optimisation pass 3 (boot, texture memory, GC, frame pacing) with before/after

Measured in software GL (Chromium swiftshader) on a machine that was shared with other agents (load average 15 to 30 on 4 cores), so absolute milliseconds are inflated 2 to 4x; the base and the new tree were always run interleaved from two copies of the tree (`/tmp/base` = the tree at the start of this pass, `/tmp/after` = the same tree plus the files of this pass). Trust ratios, not seconds.

## 1. Boot (title / hub path, 390x800)
| | before | after |
|---|---|---|
| time until the boot overlay lifts, low tier, median of 4 (min) | 15.1 s (12.8) | **3.7 s (2.7)** |
| same, high tier, 2 runs | 31.6 / 25.9 s | **5.9 / 2.0 s** |
| main thread busy until then (CDP `TaskDuration`), low median | 14.7 s | **2.6 s** |
| JS time (`ScriptDuration`), low median | 1.86 s | **0.49 s** |
What moved (in order of value):
- **FightView is no longer part of the boot.** `game.js init0` builds only the hub. `Game.ensureFightView()` builds the FightView on first use (it saves and restores the composer scene and keeps its HUD in the old DOM slot, right after the hub HUD). `Game.prewarm()` builds it and runs `FightView.warm()` in IDLE time after the overlay lifts (400 ms + `requestIdleCallback`), `playFight` / `watchReplay` await it (`prewarm({ immediate: true })`, with a "The arena is being readied" toast if the player is faster than the idle work). `?demo=1` still builds and warms before the first frame (tools and tests keep their old behaviour); `?manual=1` does NOT prewarm in idle (deterministic stepping): add `&warm=1` to get it, or `await __LM3D.idle`. `?nowarm=1` skips the warm, `?nojit=1` skips the JIT warm-up. `game.warming` pauses the main loop while the warm moves the camera and the composer scene.
- **Procedural textures are baked off the main thread.** `envtex_gen.js` holds the pure pixel generators (no three, no DOM), `envtex_worker.js` runs them in up to 3 module workers (biggest job first), `envtex.js` keeps the synchronous `make*Texture` API: `prepare(PLAN.hub())` is started at the top of `main.js` (before the WebGL context exists), the make* calls then find their bytes in `READY` and only wrap them in a `DataTexture`. A miss (worker unsupported, timeout 15 s, spec not in `PLAN`) bakes with the same generator on the calling thread, so output is identical. `stats().tex = {hit, miss, idb, worker, workerMs, syncMs, mode}`: **hub boot has 0 misses**. KEEP `ET.PLAN` IN SYNC with the make* calls of env_ludus, buildings, hub and env_arena.
- **IndexedDB cache** (`lm3d_tex`, key = `GEN_VERSION|spec`, the spec carries the tier-scaled size so tiers never collide): raw bytes, written in idle time, read in a race with the workers (workers start after 90 ms when the cache has not answered; whichever finishes first wins, cancelled jobs are dropped). Bump `GEN_VERSION` in envtex_gen.js when ANY generator changes its output; old versions are swept. Repeat visit: 9 of 9 specs from the cache, worker CPU 0 ms (first visit: 2.2 to 2.8 s of worker CPU). Wall-clock gain is not visible in software GL under load because IndexedDB itself answered in 1 to 2 s there; on a device it is tens of ms.
- Textures are `DataTexture`s now: sRGB RGBA colour and a **single channel R8 bump** (was two RGBA canvases). Bit-identical to the old canvas path: FNV hash of colour and bump bytes equal for sand 512 / 1024, stone x3, marble, ground, roof, cloth, and a GPU render of colour and bump (`.r`) hashes equal for sand, stone, roof, marble. Rows are written bottom-up so `flipY = false` shows what the canvas showed. Hub screenshots base vs new sit at the screenshot noise floor (45.6k differing pixels base vs base, 55.7k base vs new at high, 56.1k medium; 3v3 fight 0.3 % / 1.7 %).
- `audio.ensure()` is deferred: `Game.deferMusic()` queues `music.setMode / setIntensity` (the title and the hub call them while booting) and replays them in order once the game is interactive (`markInteractive`, flushed in idle, or on the next `later()` call). 0 AudioContexts at the moment the overlay lifts.
- Boot overlay progress bar (`#bootbar`, 8 to 48 % while textures bake, 85 % after init, 100 % when lifted) and `stats().boot = {tex0, game, texHub, hubBuilt, init, reveal, warmed}` in ms since `main.js` started; `window.__bootT` is the same object.
- Not done: moving the canvas-2D textures (courtyard floor, Colosseum facade, wood, radial blobs, sail) into the worker (OffscreenCanvas); they are small (about 100 ms on a phone, the first canvas use costs about 200 ms in software GL). A fast tier-up of the hub shaders (`compileAsync` right after `createHub`) was not attempted: programs are keyed by the composer target and the lights.

## 2. Texture memory (procedural textures, GPU resident estimate)
- `envtex.configure({ tier, deviceMemory })`: tiles of 512 px and up are scaled by K: low 0.75, low with <= 2 GB 0.56, medium with <= 3 GB 0.75, high and desktop 1 (`?texq=1` forces 1 for pixel diffs). Stone mortar width scales with the size so the look holds. The courtyard pattern keeps its 512 px repeat period (`CanvasPattern.setTransform`).
| texture (RGBA + mips, GPU) | before | after, high | after, low (K 0.75) |
|---|---|---|---|
| arena sand 1024: colour + bump | 5.6 + 5.6 MB | 5.6 + 1.4 MB | 3.2 + 0.8 MB |
| 512 tile (stone, marble, ground, sand): colour + bump | 1.4 + 1.4 MB | 1.4 + 0.35 MB | 0.8 + 0.2 MB |
The resident procedural total after boot on low is 12.7 MB (hub + arena); the CPU side holds the same bytes once (no canvases, no ImageData copies).
- **Release / re-warm** (`Game.memSwap(to)`, called by `setScene`): on the low tier, or any device reporting <= 3 GB, when `renderer.info.memory.textures >= 24` or the procedural textures resident exceed 6 MB (4 MB at <= 2 GB), the GPU copies of the OTHER scene's procedural textures are disposed (`ET.sceneTextures(root)` walks the materials, only textures made by envtex, minus the ones the entering scene uses); the entering scene's released textures are re-uploaded with `renderer.initTexture` BEFORE the first frame, so there is no upload hitch on the first visible frame. The CPU bytes stay (three re-uploads from them). Measured low tier cycle: hub 12.7 MB resident -> fight 5.7 MB (8.0 MB freed) -> hub 9.0 MB (11 textures re-uploaded; the arena-only ones stay released). `stats().mem = {texMB, log: {releases, freedMB, warms}}`. Switch off for a test with `game._memOff = true`.
- Not covered (not in the procedural set): the fx decal canvases and the arena sand decal (fx.js), shadow maps, bloom targets.

## 3. GC / allocation
| 3v3 medium, heap sampler incl. collected objects, 300 frames after 3 warm fights, KB per frame | before | after |
|---|---|---|
| everything | 100.4 | **79.4** |
| rig.js total | 39.5 | **16.5** |
| `Animator.update` | 16.3 | 7.3 |
| cloak `collide` / cloth `write` | 6.9 / 4.7 | 0 / under 0.5 |
Standing alone, 6 warmed rigs allocate 2.4 KB per frame before and after; cold (300 frames after 300 warm) 9.9 to 7.5 KB. **The 40 KB goal was not reached**: the 79 KB left is mostly other files (director 12.8, fightview 12.1, builtins `Math.max/min` and iterators 10.6, gore 7, fx 5.5, arena 4, gear 3.7). Beast hunts: not re-measured after the beast.js changes (checks pass, allocation by inspection only).
What the "unexplained 12 to 20 KB per frame inside Animator.update" was (measured with the real fighters of a 3v3, `--max-inlined-bytecode-size=0`, `%GetOptimizationStatus`, `--trace-deopt`):
- It is a **tier effect, not a steady-state leak**. Standing alone, a warmed-up `rig.update` of six rigs allocates **2.4 KB per frame in total** (before and after this pass), and `Animator.update` itself 21 B per call. In a real fight `update` is repeatedly NOT optimised (optimisation status flips between optimised and plain after fights start; this Chromium tiers Maglev first and TurboFan late, and a deopt returns the function to the interpreter), and in the interpreter and baseline tiers EVERY double result of every statement is a heap number: the additive-flinch loops (22 joints x 8 flops, twice) and the joint write loop inside `update` itself were about 5 KB per call while a hurt flinch is active. Boxed doubles at calls of non-inlined functions (`Euler.set`, `Quaternion.slerp`, `lerpVectors`, `Vector3.set`, `BufferAttribute.setXYZ`) add to it.
- Fixes (rig.js, beast.js): the pose mixer works on flat `Float64Array`s with three's Euler / slerp / multiply maths inlined and bit-identical (`eulerAll`, `slerpA`, `blendQ`, `mulQ`; the slerp factor travels in a scratch `Float64Array`, a computed double argument is boxed on every call); EVERY per-joint loop of `Animator.update` (`scaleAdd`, `addLateral`, `writeJoints`) and of `BeastAnimator.update` (`composeOut`, `fadeOut`, `writeQuats`, `evalClip`) is a small function of its own, which tiers up after a few calls even while the big `update` still runs in the interpreter; clips are instances of ONE `Clip` class (fixed fields, one prototype `sample`, attack lag handled by a field, key entries `{t, p, e, d}` with `d` declared) instead of four object shapes with 195 distinct closures per rig set ("wrong call target" / "wrong map" deopts of `update`); the cloak collider reads the body matrices once per verlet step (`prep`) and works inline on matrix elements (it called `worldToLocal`, which walks the parent chain and inverts a matrix, per vertex per iteration); `ClothGrid.write` transforms inline into the typed array (no `setXYZ`); `Math.min / max / sign` builtins replaced by ternaries in the per-frame code (a builtin call boxed its result in the lower tiers); `body.scale.set` and friends by field writes; beast joint quaternions straight from the XYZ euler channels (no `Euler.set` + onChange callback per joint) and beast clips sampled by `evalClip` over typed key arrays (no Map iteration, no call and no polymorphic ease call per channel).
- JIT warm-up: `Game.jitWarm()` runs the kept warm rigs (walk, run, strafe, attack, hurt, cross-fade) for 200 frames in 7 ms slices at the end of the idle prewarm (120 frames when a fight is waiting), so the first fight meets compiled code. `?nojit=1` skips it.
- Verified identical: a scripted run over 4 styles (idle, walk, run + strafe, attacks, hurt additive with side, state cross-fades, stagger, death) compares 6192 joint quaternion / hip / body values against the old Animator: max abs difference 0. `lab/rig_test.html` PASS 886 checks, `lab/beast_lab.html?test=1` PASS 486 checks.
- Where the rest is (not my files, reported): `tactics.js` drawFrame / stroke / ringPath / pos about 10 KB per frame (path and style strings per frame), `director.js` (`needD`, `units.map`, `recenter` forEach with `Math.max/min`, `centroid` iterators) 8 to 13 KB, `gore.js:565` frame hook 3 to 13 KB (varies with the fight), `fightview.syncFighters` 5.7 KB + `stepPush` 2.7 KB + `placePlate` 1.7 KB, fx `step` / `updateEmitters` 4 KB, `gear.js:185` (a per-rig-update closure) 120 B per call, `gear.js` flap `prep` 3.2 KB, `postIK` 3.5 KB (the quaternion getters `x / y / z / w` that `applyQuaternion` and `getWorldQuaternion` call on `kq`; a direct matrix-element yaw would remove them).

## 4. Frame pacing and the governor (post.js `createDynamicRes`, main.js `loop`, `fpsCap`, `sampleRefresh`)
Per scene, never oscillate, documented rules (all simulated in node by extracting the function from post.js: steady 60 Hz, one 120 ms hitch, heavy scene, borderline device, 120 Hz, locked 30 Hz, 5 s stall, floor demotion; the recipe is "slice `createDynamicRes` out of post.js with `new Function` and feed it a frame-time function of the scale"):
- **Separate state for the hub and the fight** (`dyn.setScene('hub' | 'fight')`, called every frame by the loop; swapping ignores 45 frames): scale, EMA, recovery wait, ceiling. A heavy 3v3 that settled at 0.7 no longer leaves the hub soft (simulated: fight 3x heavy settles at 0.7, the hub is back at 1.0 the moment the scene switches).
- Target follows the display: `target = max(18.2 ms, 1.09 x vsync)`, slow = EMA above 1.25 x target for 20 frames (scale -0.1, floor 0.55), 150 more slow frames at the floor demote the tier (`onTierDemote`, which also writes the 14 day cap). Fast = EMA under `max(0.8 x target, 1.12 x min(best, vsync))` for `wait` frames (240). The old rule judged "fast" against the best frame time seen, which already included the load (a device at 19.2 ms at scale 0.8 kept retrying 0.9); now it is judged against the vsync, so that device settles without a single failed retry (2 scale changes in 9000 frames instead of 6).
- Hysteresis: the neutral band between fast and slow (about 4 ms at 60 Hz) changes nothing. A drop within 600 frames of a recovery doubles `wait` (max 3840); the SECOND failed recovery to the same level pins a ceiling there (no retry for 36000 ticks, about 10 minutes, then one more try) so a borderline device stops pulsing (simulated borderline device: 9 changes in 60000 frames, all in the first 1100 frames and one retry after the ceiling expires). `dyn.hardReset()` (context restore) forgets ceilings.
- **30 Hz locked displays** (iOS Low Power Mode): `main.js sampleRefresh` estimates the vsync from the lower quartile of the last 120 raw rAF gaps; a window measured while the loop was capped (every other frame skipped, so a slow frame cannot hide the vsync) is "certain". Certain ~33 ms: the governor targets 36 ms from the start (no resolution dip, no tier demotion); certain ~16.7 ms proves a normal display. Uncertain ~33 ms (a GPU that misses every vsync looks the same) falls back to a test: two scale drops in a row that changed the EMA by less than 7 % on a 30 Hz-looking vsync give the pixels back and lock the target to 36 ms (`stats().pacing.gov.locked30`).
- **Frame-rate cap**, in `fpsCap(now)` (`stats().pacing`, `PWR`): 30 fps after a demotion to low, with the battery under 20 % and not charging, while the Compute Pressure API (`PressureObserver`, Chromium) reports CPU `serious` or `critical` (held 20 s after it clears; the sandbox that measured this pass reported `critical` all the time, so the cap showed up there), after 5 s of hub idle, and `?fps=N`. **>= 100 Hz panels** render every `round(Hz / 60)`th vsync (120 and 144 Hz: about 60 fps, half the GPU work and heat; 90 and 75 Hz are untouched; the skip rule is `(d - 0.35) x vsync`, not a millisecond cap, so 144 Hz does not jitter between 72 and 48). A capped loop at 30 does not feed the governor (it resets it); the 60 fps cap on a fast panel does.
- **`?perf=1`** (or `__LM3D.perf(true)`): a hidden overlay, top left, refreshed 4x per second: scene and phase, tier, scale (and the ceiling), 30 Hz lock, frame ms and fps, CPU work avg / max over 120 frames, display Hz, cap, HOT / battery saver, governor EMA / target / best / frames to the next recovery, draw calls, triangles, geometries, textures, programs, JS heap (Chromium), procedural texture MB resident and K, spike count. It costs one `textContent` write per 250 ms and nothing when off.

## 5. Verification of this pass (390x800, live tree)
- 3v3 calls / tris: low 108 / 182k, medium 112 / 201k, high 145 / 280k. Hub (empty ludus): low 34 / 144k, medium 46 / 204k, high 50 / 327k. Hunts medium: lion 54, pride 77, menagerie 97 calls.
- 10 fight to hub cycles, low, forced GC: geometries 115, textures 42, programs 70, procedural MB 5.7 (fight) / 9.0 (hub) identical every cycle. JS heap creeps about 0.1 MB per cycle and the DOM count grows, exactly as in the old tree (45 to 46 MB there), so it is not new.
- Texture release: hub before and after a fight with the policy on vs off differ by the same number of pixels (control), so no pop is attributable to it.
- node structure test 523 passed, ludus_maximus_3d 592, saves 52; lab/rig_test.html PASS 886 checks; beast_lab.html?test=1 PASS 486; bot 2 weeks: week 3 reached, 6 fights, zero errors.
- Recipes: boot compare = two copies of the tree on two ports, interleaved runs, CDP `Performance.getMetrics`; GC = `HeapProfiler.startSampling` (64 B, collected objects included) with `--js-flags=--expose-gc`, exclude stacks through `acquireProgram` (shader compiles); tier status = `--allow-natives-syntax` `%GetOptimizationStatus`; deopts = `--trace-deopt-verbose`.
