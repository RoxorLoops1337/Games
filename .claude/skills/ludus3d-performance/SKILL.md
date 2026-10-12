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
