---
name: ludus3d-gore
description: Ludus Maximus 3D only. The gore system (js/gore.js plus the blood shader in js/rig.js): blood spray and arterial jets, sand stains and pools on the fx decal canvas, blood and gashes on fighters, dismemberment with tumbling limb and head props, gibs, gore audio, hit-stop and red vignette, the Gore setting (Off / Low / Full), budgets, tuning numbers, the test recipes and the pitfalls.
---

# Ludus 3D gore

Adult audience, Roman gladiator sim, Spartacus style arena violence: stylised and loud, never sexual, never a real person. Everything is procedural and cosmetic. Read `ludus3d-vfx-gamefeel` (fx.js, feel) and `ludus3d-character-animation` (rig) first.

## Files and who calls what
- `js/gore.js`: `createGore(fx, {scene, audio, feel, tier})`. Created by `FightView` right after `createFx`/`createFeel`. It registers one hook (`fx.hooks.push`) that simulates and draws every frame; `gore.postFrame(realDt)` runs the red vignette in real time.
- `js/fx.js`: added `Layer.putS` (stretched immediate streak), `fx.hooks`, `fx.decalDraw` (ctx, k px/m, toPx), `fx.markDecals()`, `fx.addNormalParticle`, option `decalGap`, `fx.hit(.., {flesh:true})` (30% sparks on flesh, the blood carries the hit). Decals now receive shadows.
- `js/rig.js`: `makeBloodUniforms`, the blood overlay in `shadePatch` (`xo.blood`), `rig.addBlood/setBlood/addWound/clearBlood/sever/partFrame/restoreParts/jointRest`. Skin, cloth, leather get gashes, metal/steel/trim get stains only. Zero extra draw calls (rig_test: max 13).
- `js/audio.js`: sfx `slashWet crunch boneSnap spurt splat gibThud crowdGore`.
- `js/fightview.js` (`onEvent`): `hit` -> `gore.onHit`, `down` -> `gore.onDown` (then `dir.cue('kill', {extra: gore.framePoints(id)})`, director `_kill` adds `p.extra` to the framed points), `bleed` -> `gore.onBleed` (the cartoon bleed status icons are skipped while gore is on), `aoe big` stamps `bigAoeT` so a kill within 0.7 s gibs the victim.
- `js/screens/more.js`: pref `gore` in the existing prefs object (`ludus_maximus_3d_prefs`, default `'full'`), `applyPrefs` mirrors it to `globalThis.LM3D_GORE`. `goreLevel()` order: `?gore=off|low|full` (tests), `LM3D_GORE`, stored pref. Reduced motion (OS or `lx-reduce-motion`) forces off.

## Levels and tiers
| | droplets / pool size | jets | dismember + gibs | wounds |
|---|---|---|---|---|
| Off | none | none | none | none |
| Low | 0.5x | hits only | none (no limbs, no chunks) | yes |
| Full | 1x | hits, kills, stumps | yes | yes |
Tier scales counts (high 1, medium 0.75, low 0.5), droplet pool (460 / 320 / 200), pool radius (low 0.72x), splat budget per frame (70 / 36). Decal canvas: fx `arenaRadius 15` (34 m span), 2048 / 1536 / 1024 px, upload gap 0.12 s (0.2 s on low).

## Design
- Droplets: own gravity (11.5), drawn in fx's normal-blend particle layer as streaks (round blob when slow). On landing they stamp a splat sprite (6 prebaked canvases, stretched along velocity) on the decal canvas and may splash two child droplets.
- Jets: pulsing (period 0.3 to 0.66 s, duty 0.55 to 0.7), attached to a joint with a local offset and local direction so they ride a staggering or falling body. Hits with frac > 0.12 or crit spawn 1 to 2 jets, the killing blow a 3.4 s fountain, a stump 3.4 s (head 4.8 s).
- Pools: irregular blobs grown by repeated stamps (alpha 0.3 each), then a gloss highlight, then one `source-atop` dry pass (darkens only where blood already is). Do not dry every splat: stacking the pass turns the floor black.
- Smears: round-capped strokes, dragged limbs leave them. Bloody footprints: `onStep` (animator `step` event) stamps red prints while `foot` > 0, refilled when the foot is inside a pool.
- Bodies: uniforms per rig, position from the un-skinned vertex (rest space). Soak = noise threshold rising with `uBlood`, less on legs; up to 6 gashes (centre, direction, half length) with halo and runnel; up to 3 stump paints. Wet gloss (`uBFresh`) fades over 9 s. Wounds are placed from the world hit direction on the side facing the attacker (`placeWound`).
- Dismemberment: `rig.sever(part)` collapses a joint (`scale 1e-4`), so everything skinned below vanishes, and paints raw flesh and bone on the stump. Parts: `head forearmL/R armL/R shinL/R legL/R`. The prop is ONE `InstancedMesh` (`gore_gibs`, 1 draw call, hidden when empty) holding limb, head and chunk geometry; the vertex shader collapses the shapes that do not match the instance `iType`. Props tumble, bounce (splat, droplets, `gibThud`), leave an airborne blood trail, a smear while sliding, settle flat and grow a pool. 12 limb/head slots, 44 chunk slots (ring). Props stay until the next fight (corpses stay too).
- When: killing blow of the last unit 100%, lethal crit 85%, other lethal hits 10% + 90% of the hit fraction (cap 45%), nothing when the kill had no source (bleed) unless gibbed, big ultimate 100% (2 to 4 parts + 26 chunks + 70 droplets). Rare non-lethal: heavy crit on a fighter under 45% hp, 7%, takes the off-hand forearm. Head 52%, forearm 18%, arm 15%, shin or leg 15%.
- Feel on gore moments: `feel.hitStop` 80 to 150 ms (feel takes the max), trauma +0.12 / +0.38, red flash on dismember, `gore.pulse` red vignette (DOM div, `z-index 44`, opacity decays 1.7/s).

## Determinism
`gore.reset(seed)` reseeds a private `mulberry` (`replay.seed` when replaying, else a hash of the roster). The sim RNG (`LM.setRandom`) is never read or written; gore only reads events and unit state after the step. `gore.js` must contain no `Math.random`.

## Budgets (measured, swiftshader)
- Draw calls: +1 (`gore_gibs`) only while props exist; rigs unchanged (max 13); tier low 3v3 stayed 145 to 148 (limit 150). Triangles: +4k with a head and a few chunks, +20k during a full gibbing (instances draw all three shapes; keep `gib.count` tight, it is `limbs used` or `12 + chunks used`).
- CPU: `fx.update` incl. gore 0.19 ms average (0.16 without gore), 3.5 ms worst frame (a full gibbing). The decal canvas upload is the only real cost (2048 px on high).

## Test recipes
- `node tools/ludus3d_shot.mjs "http://localhost:8211/ludus_maximus_3d/index.html?demo=1&team=2&lvl=8&tier=high&manual=1" out --at 8,13,18,23,28,33`.
- Force a kill: advance to `phase==='fight'` (about 6 s), then in `--eval`: set `B.hp=0; B.down=true; B.s={}`, `view.onEvent({k:'hit',src,dst,dmg,crit:true})`, `view.onEvent({k:'down',dst,src})`, `F.done=true; F.winner='A'`. Patch `setTimeout` for 2400 ms (the victory shot timer is wall clock) or the kill cam is cut short when frames are stepped fast. `?gore=off|low|full` switches level. `view.gore.stats()` and `view.gore.debug()` (prop positions) help.
- `node tests/ludus_maximus_3d_structure.test.mjs` checks the files, the pref, the sfx names and the no `Math.random` rule; `lab/rig_test.html` must keep `callsMax <= 14`.

## Pitfalls (each one bit me)
- Streak cells are only about 20% as wide as their quad: pass `size * 2.6`, or blood looks like hair lines.
- Blood on bodies saturates fast: per hit `+= frac * 0.8`, coverage threshold `1.24 - 0.5 * blood`. Higher and the fighters look painted red and lose their silhouettes against a dark floor.
- A runnel is a vertical line in rest space: long runnels paint whole legs. Keep `len * 2.8`.
- Hit-stop freezes fx time on purpose, droplets hang for the freeze: that is the feel, not a bug.
- `gl_Position` collapse needs `side: DoubleSide` materials and a tight `gib.count`, otherwise every instance pays for all three shapes.
- Scale a joint to exactly 0 and `decompose` returns NaN: use 1e-4, and zero the hand IK weight when the left arm goes.
- Only the director kill shot frames the limb: it needs `extra` points, pass them in the cue.
- Weaknesses: the head prop reads best from the side (hair is a flat vertex colour); armour stays on the body when a limb is severed; cloth and cloak patterns swim slightly because their `position` is not rest space.
