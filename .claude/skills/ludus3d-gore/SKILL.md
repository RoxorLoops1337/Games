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

## Round 2 (fight team): props, weapon drop, coverage cap
- Gib mesh now has 9 shapes in the one InstancedMesh (`iType`): 0 limb, 1 head, 2 chunk, 3 sword, 4 spear, 5 trident, 6 helmed head, 7 armour plate, 8 plume tuft. Extra vertex attribute `aMask` (0 vertex x instance colour = skin / wood, 1 x `iHair`, 2 x `iMetal`, 3 absolute colour = flesh, steel, blood) and per instance `iHair` / `iMetal` (hair or plume colour, rarity metal). Plates, plumes and chunks share the 44 ring slots (`isRing`), limbs / heads / weapons the 12 long slots.
- Head prop: skin tone from `rig.palette.skin`, hair colour (bald = skin) or helm dome + cheek guards + crest in the plume colour (murmillo, thraex, hoplomachus), ragged neck stump (jittered rim, pale windpipe ring, two dark arteries, six dangling flesh cones), ear, nose, brows. Throw is gentler (about 1 to 4 m), tumble is a roll about the axis across the throw (3.5 to 7 rad/s), it settles with the neck horizontal (`settleOrient`). Always look at it from several sides with `tools` style closeups (override `view.applyCamera`, track `gore.debug()`).
- Weapon drop: `G.sever` on `armL/armR/forearmL/forearmR` calls `dropWeapon`. The weapon in that hand (rig.style: sword for murmillo / thraex / dimachaerus, spear for hoplomachus, trident for retiarius) spawns as a prop at the hand socket with the socket direction and falls to the sand (`metalClang`). When no weapon hand is left the animator switches to a runtime `brawl` stance (`ensureBrawl`: copied from the exported `WEAPON_POSES.dual` left-hand backhand attacks, stump tucked) via the public `rig.animator.setWeapon('brawl')`; the spear second-hand IK is zeroed through `animator.ik.hand`. Off-hand loss hides the net mesh and zeroes the grip IK. The non-lethal forearm now takes the weapon hand 62% of the time (10% chance on a heavy crit under 45% hp).
- `popArmor`: heavy hits (frac > 0.16 at 28%, crits 50%) spawn 1 to 4 plate shards (metal colour, leather brown for retiarius / dimachaerus) with sparks and a clang; a hoplomachus plume pops on crits or frac > 0.3 (the `plume` secondary mesh is hidden, `restoreParts` brings it back). The real armour stays on the body, only spall flies off.
- Coverage: `measureCover` (every 1.5 s, 32 px downsample of the decal canvas, `G.cover` 0..1) feeds `capK()` (1 fresh .. 0 covered between 0.10 and 0.24): small splats are skipped, large ones shrink and fade, pools shrink and stamp fainter. `dryAll` every 5 s (max 7 times) darkens existing painted pixels (`source-atop` 5.5% dark brown), `clearUnderFeet` every 0.45 s lifts blood under living fighters (destination-out radial, so shadows and legs stay readable). A 3v3 reaches cover 0.3 to 0.45 at 36 s, 1v1 stays under 0.1 for the first 10 s.
- Weaknesses: the head face is only visible when it lands face up; plates are spall, not real removed armour; with 6 fighters at low tier draw calls are 149 of 150.
- Pitfall: `paint()` helpers must write colour components one by one (a 4 element array `set` at the last vertex overflows the typed array).

# Update: execution gore, decal marking, coverage
- `gore.onDown(id, {last: true, crit: true, dx, dz})` is now called from the finisher's `hit` event (fightview `execHit`), so the head goes with the blow. Other kills unchanged.
- Every stamp calls `fx.markDecals(x, z, r)` (tile upload) and `addCover(x, z, r, a)` (analytic coverage grid); never read the decal canvas back. `gore.settle()` clears airborne drops / jets and lets props land (replay seeks); `gore.warm(on)` builds and draws the gib mesh once for shader warm-up.

# Update: floor blood pass (organic splats, thinner, aging)
- Splat sprites are now three families (gore.js `SPR_R` round, `SPR_T` teardrop with a tail and droplets along +x, `SPR_S` fine spray): noise-eroded closed paths (three sine octaves + pseudopods), alpha 0.6 to 0.9 rim to centre, no radial spikes. `stampSplat` picks the family from size and stretch (size under 0.14 = spray, stretch over 1.35 = teardrop), jitters angle and alpha. Droplet landing sizes are skewed small (`1.6 + 2.8 * R * R` times the drop size, clamp 0.07 to 0.42) so most splats are small and a few are big.
- Aging: `dryAll` (every 5 s, up to 14 passes) darkens painted pixels (source-atop) AND thins them (destination-out 4 percent, about 0.57x alpha after 14 passes) and decays the coverage grid by 3.5 percent, so old blood is a dull brown stain and the sand shows through; fresh blood stays bright and opaque.
- Footprints: `f.foot *= 0.66` per step and stop under 0.12, so 4 to 5 prints that get paler, then clean sand.
- Coverage is still analytic (`addCover`); never read the decal canvas back in the game. For tuning, a test tool may read `fx.decalCanvas` ONCE per sample (alpha over 50 inside the arena radius): the 60 s 3v3 target is about 25 percent at most.

# Update: juicy gore pass (GORE-JUICE)
The owner asked twice for more gore. Same budgets, same Off / Low / Full semantics, more spray, more meat, more sound. Everything below lives in `js/gore.js` (plus two sfx in `js/audio.js`, the normal particle pool 900 to 1300 in `js/fx.js`).
- **Spray**: per hit `(11 + 230 * frac + 52 crit) * K` droplets (was 7 / 150 / 32), droplet size x1.2, landing splats up to 0.5 m, 4 to 7 floor splats per heavy hit, plus "thick gouts" (3 to 17 big slow blobs, size x2.4) and 4 to 6 mist puffs (alpha 0.42, spawned 0.3 m past the wound). Do NOT raise the mist: puffs over a body count as that fighter's pixels in `tools/ludus3d_readability.mjs` and turn both teams red.
- **Heartbeat jets** (only crits above 10% and frac > 0.2 hits, readability showed more jets and chunks on regular hits turn team colours red): `addJet({beat: true})` pulses lub-dub (`pulse(ph,0,0.2) + 0.55 * pulse(ph,0.27,0.43)`), speed follows the pulse (0.3 + 0.8 env). Used for deep wounds (frac > 0.16 or crit, Full), stumps (speed 8 / 10, life 3.9 / 5.4 s), the killing blow and a second jet on the last kill. Jet cap 20.
- **Lens splatter**: lazy 2D canvas `.gore-lens` (z 43, created on the first call behind `G.on`, never under Off), 4 prebaked blurred sprites, max 8 drops (4 on Low), 1.8 to 3.2 s, slide and stretch down then fade (wipe). Placed on the left or right EDGE of the screen (the side the action is on) so the middle stays readable; centre placement read as floor stains. Driven by `postFrame(realDt)`, redrawn only while a drop lives. Counts: heavy hit 0 to 2, sever 3 to 4, kill 1, last kill 3.
- **Meat**: Full only, on crits (and frac > 0.25) 1 to 2 flesh chunks, a bone shard on crits (`chunk(pos,bx,bz,1)`, thin pale), a blood-soaked sand clump flung from the floor (`kind 2`, dark brown); severs throw 5 to 8 (every third a bone shard). The ring of chunk slots is capped per tier (`ringCap()` 16 / 30 / 44) because EVERY instance of the gib mesh costs the triangles of all shapes (about 1.6k): low tier Full peaks at about 238k triangles (limit 300k), it was 288k with the uncapped ring.
- **Impacts**: sfx `squelch` (wet slap, under slashWet and crunch) and `cleave` (heavy chop, crits, frac > 0.24, severs, last kill), both in the 'gore' voice category (cap 6). `feel.kick` camera shove on crits (0.16), kills (0.2), last kill (0.3), severs (0.28); hit-stop crit 120, kill 110, last kill 130, sever 150 (feel takes the max and caps it).
- **Finisher** (`onDown` with `ctx.last`): 16 mist puffs, a 50 droplet fan at speed 11, 6 chunks / shards, a second heartbeat jet, 3 lens drops, cleave and crowdGore. Execution moves already pass `last: true` from `execHit`, so the burst lands on the strike.
- **Weapon and wounds**: `f.wet` (the attacker after a heavy hit, decays 0.03/s, so about 30 s) drips from the weapon hand tip; `f.leak` (victims, 0.05/s, dead bodies 0.07/s) drips from the chest and leaves a smear trail (`stampSmear`, wider for a body that is shoved) when the fighter moves more than 0.35 m. `fighterDrips` runs from an array (`fArr`), not the Map. Beast attackers add 3 extra gouts and drip from the head joint; beast victims use the same fur wound path.
- **Pools**: down pool 1.3 + up to 1.0 m, second pool 0.75, a finished pool creeps to 1.16x over 16 s with a fresh wet rim (`stampPool(p, 0.55)`), dark thick core in `stampGloss`. Coverage cap (`capK`) and `dryAll` are unchanged, so the sand stays readable.
- **Camera safety**: droplets within 7 m of the camera shrink (x0.3 at 2 m), otherwise a kill cam close-up drowns in red streaks.
- **Perf**: droplets are now struct-of-arrays (`Float32Array` per field, `act` / `freeI` index stacks): a double field of a pooled object is a heap number, an array slot is not. Droplet pool 620 / 420 / 240 (high / medium / low). gore.js allocates about 10 to 13 KB per frame in a 3v3 on medium (the rest is canvas API calls: each `drawImage` / `translate` boxes its double arguments), whole frame about 140 KB. Draw calls: +0 (the lens is DOM, the gib mesh is still the only instanced mesh).
- **Test**: `tests/ludus_maximus_3d_gore.test.mjs` (in `test:ludus3dqa`) runs the same six crits and a kill at Off / Low / Full in a real 3v3 on the low tier: Off has zero drops, jets, props, pools, splats, no `.gore-lens`, no visible `gore_gibs`; Low has no props and fewer splats and lens drops than Full; Full stays inside 150 calls / 300k triangles and the caps. Structure test: last block of `tests/ludus_maximus_3d_structure.test.mjs`.
- **Readability tool caveat**: `tools/ludus3d_readability.mjs` at T=7 is flaky on its own (gore Off fails about 1 run in 5: the dominant "team A" hue flips between the blue shield and red cloth). Judge it over several runs, and never raise body blood (`addBlood`) to compensate.
- Weaknesses: the lens drops are generic sprites (no refraction); chunks are flat icosahedra (small, dark); the bone shards read as pale specks; plates in a rarity metal can be bright green (existing popArmor, not new); drips from a weapon are small round blobs.
