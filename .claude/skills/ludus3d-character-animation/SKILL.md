---
name: ludus3d-character-animation
description: Ludus Maximus 3D only. How to build and animate the procedural gladiator (joint-pivot humanoid, clip player, two-bone IK, foot planting, verlet cloak/plume, hit flash, squash) for js/gladiator.js and js/gear.js. Includes API of the tested reference module, attack timing tables, sign conventions, pitfalls and a recipe for new weapon poses.
---

# Procedural gladiator rig and animation (three.js r170, no assets)

Reference code (tested, copy and adapt, do not import from lab in the game):
- `ludus_maximus_3d/lab/ref/rig_ref.js` rig builder, Animator, IK, cloth/chain secondary, weapon pose tables.
- `ludus_maximus_3d/lab/ref/gear_ref.js` sword, sica, spear, trident, shields, helms, galerus, greaves, skirt, equipStyle(rig, style).
- `ludus_maximus_3d/lab/rig_ref.html` 5 styles animated. `?test=1` runs 123 checks (finite transforms, feet above ground, attack events, hand IK). `?sheet=attack1&style=thraex&times=0,0.18,0.27,0.4&view=45` renders a pose sheet of any clip (views: front, 34, 45, side).
- Shot: `node tools/3d_shot.mjs "http://127.0.0.1:PORT/ludus_maximus_3d/lab/rig_ref.html?sheet=...&times=..." out.png --w 1500 --h 450 --secs 0` (serve repo root with python http.server). Research note: the network was blocked in this session, the design uses established practice (pose-key clips with eased segments, inertial snapshot blending, analytic two-bone IK, verlet cloth, critically-underdamped springs) from memory, not fresh sources.

## Conventions (the thing that bites first)
Character faces +Z, left is +X, up +Y. Every limb hangs along local -Y.
- Arms, thighs, forearms: NEGATIVE x swings FORWARD. Knee flexion POSITIVE x. Elbow flexion NEGATIVE x. Toe down (plantarflex) +x.
- Torso/head/hips: forward lean is POSITIVE x (opposite sign). Yaw: NEGATIVE y turns right shoulder back (windup of a right-handed swing), POSITIVE y strikes across to the left.
- Abduction: left arm +z, right arm -z. Positive z on the right arm adducts (crosses the body).
- Euler orders: hips/spine/chest/neck/head 'YXZ' (yaw outermost), all limbs 'XYZ'.
- Weapons are authored along +Y with the grip at the origin. `joints.handR/handL` sockets are rotated Rx(pi) so weapon +Y runs along the forearm axis. Wrist x bends the blade up/down.
- Dimensions (DIM): 7.3 heads, hips pivot 0.985, thigh 0.42, shin 0.43, upper arm 0.30, forearm 0.27, shoulder x 0.27. build:{bulk,height,shoulder}.

## Architecture
```
root (game places/rotates) > body (squash scale, knockdown tilt, lunge offset; origin at the feet)
  hips > spine > chest > neck > head ; chest > shoulderL/R > elbow > wrist (> handL/R socket)
  hips > hipL/R (thigh) > kneeL/R > ankleL/R
sockets: helm, back, cloakTop, beltFront/L/R/Back, forearmL, chestFront
```
Pivots have no rest rotation, so IK and quaternion blends are trivial. Geometry: `lathe()` elliptical lathes for torso, 6-point `capsule()` for limbs (bulge param), flat-shaded metal/leather, smooth skin/cloth, per-vertex AO gradient colour. EVERY geometry needs a `color` attribute because all zone materials use vertexColors (missing attribute renders black). Zones: skin, hair, cloth, plume, leather, metal, trim from `palette {skin,hair,cloth,plume,metal}` (`rig.setPalette`). Lathe profiles must have increasing y or faces flip.
Budget measured: bare body 1300 tris, with full gear 1700 to 2100 (skirt tassels use 12 tri boxes, plume 5 capsules). To hit 600 to 1000 drop seg to 5 (`build.seg`), remove skirt, hands to boxes.

## API (rig_ref.js)
- `buildGladiator({palette, build, torso:'skin'|'cloth'|'leather'|'metal', armsBare, legsBare, hair:'short'|'none', boots, belt, weapon})` returns rig `{root, body, joints, sockets, mats, animator, secondary, update(dt), flash(dur,color), squashKick(a), setPalette, resetSecondary, triangles(), postUpdate[], dispose()}`.
- Per frame: `rig.update(dt)` = animator pose, matrices, hand IK, ground plant + foot level, `postUpdate` hooks (shield stabiliser), verlet secondary, squash spring, flash. About 0.15 ms per rig on CPU.
- Animator: `setWeapon('unarmed'|'sword'|'spear'|'dual')` (call before use; arms ramp in via `armed`), `setMove(vz, vx)` local velocity m/s (vx + is left), `setAlert(bool)`, `setState('move'|'stun'|'victory'|'cheer'|...)` persistent full-body state with crossfade, `play(name,{speed,mask,amp,dir})` one-shot or held action, `release()` ends a held clip (block), `hurt(dir,amp)` additive flinch (becomes blockHit while blocking), `hitStop(dur)`, `clipInfo(name)` returns `{dur,swingAt,hitAt,recoverAt}`, `look.target/w` head look, `ik.hand={target,w,side,reach,slide}`, `onEvent(name)` / `rig.onEvent` events `swing`, `hit`, `end`, `step`.
- Clips: idle, walk, run, strafe, attack1..3 (per weapon table), block (hold), blockHit and hurt (additive), knockdown (hold), getup, death (hold, sets `dead`), stun (loop), victory (hold), taunt, cheer (loop).
- Helpers: `keyClip(name, keys, opts, stance)`, `Pose`, `mirrorPose`, `solveTwoBone(upper, mid, end, targetWorld, poleWorld, bendSign(+1 knee, -1 elbow), w)`, `ClothGrid` (cloak/banner), `ChainMesh` (plume/tassel), `addCloak`, `addPlume`, `addTassel`, `Spring1`, `ease`, `attackInfo`, `poseAt(rig, clip, t)` for sheets, `triCount`.

## Layering and blending (how the player works)
1. Base: `move` blend tree (idle, walk, run, strafe weights from speed and strafe fraction; gait phase advances by DISTANCE travelled, stride 1.55 m walk to 2.9 m run, so feet do not skate; phase runs backward when vz<0) or a named state clip.
2. Action layer: slerp per joint with weight `smooth(0,fadeIn)` and a mask. Attacks use `full` when standing (lunge offsets, legs) and `upper` when speed>0.6 (legs keep running; spine and arms attack).
3. Snapshot crossfade: on every transition the last output pose is stored and slerped out over 0.06 to 0.18 s. This one mechanism gives combos, interrupts and state changes without popping.
4. Additive layer: hurt and blockHit multiply per-joint quaternions on top; `dir`=+1 hit from front (recoil back), -1 from behind; `amp` scales.
5. Look-at yaw (neck 40%, head 50%), then FK is written, then IK.
IK: left hand to a weapon grip (`ik.hand`), the hand SLIDES along the shaft to the farthest reachable point (reach 0.5, arm is 0.57), because a fixed second grip is unreachable for spears. Feet: lowest ankle lowers the hips (`groundFix`, smoothed, scaled by clip `lock`: walk 1, run 0.35 so flight phases exist), then any ankle below the floor is IK'd up, then feet are levelled with FK yaw, blended by height (flat near ground, FK when lifted). Clips set `ground:0` for lying/airborne (knockdown, death, cheer jump).

## Attack timing (seconds at speed 1; play(name,{speed}) scales everything)
Structure: guard -> windup (ease outCubic, decelerates into the coil) -> 0.035 s creeping hold (sells load) -> strike (ease inCubic, accelerates, fastest at the end) -> follow-through overshoot (outQuad) -> recovery (inOutCubic) back to guard. `swing` event at end of windup (whoosh, trail on), `hit` event at wind + 0.85*strike (apply damage and hit-stop here).
| weapon | clip | wind | strike | over | rec | total | motion |
|---|---|---|---|---|---|---|---|
| sword | attack1 | .18 | .09 | .05 | .30 | .62 | diagonal slash high right to low left |
| sword | attack2 | .20 | .10 | .05 | .32 | .67 | rising backhand |
| sword | attack3 | .40 | .13 | .07 | .55 | 1.15 | overhead smash with lunge (heavy) |
| spear | attack1 | .16 | .08 | .04 | .30 | .58 | straight thrust |
| spear | attack2 | .20 | .09 | .05 | .32 | .66 | high stab |
| spear | attack3 | .38 | .12 | .06 | .55 | 1.11 | long lunge thrust |
| dual | attack1/2 | .14 | .08 | .04 | .26 | .52 | alternating cuts (2 is mirrored 1) |
| dual | attack3 | .34 | .12 | .06 | .50 | 1.02 | cross-cut X burst |
Other clips: hurt 0.42 (peak 0.06, additive), blockHit 0.28, block in 0.11 outBack then hold, knockdown 1.0 (stagger 0.14, fall 0.42, impact 0.56, bounce 0.70, settle 0.88) then hold, getup 1.0, death 1.55 (kneel 0.5, slump 0.9, face-down 1.2, bounce 1.35), stun loop 1.2, victory intro 0.55 outBack then hold, taunt 1.7, cheer loop 0.5 (jump), idle breath 3.4 s, weight shift 7.3 s.
Rules of thumb: windup 25 to 35 percent of total for light, 40 percent for heavy; strike under 0.14 s; recovery is where the player reads vulnerability; anticipate hits with a crouch (hip -0.1) and a backward weight shift (body z -0.05).

## Feel helpers
- `rig.flash(0.12)` lerps emissive to a warm tint on all zone materials (per-rig material instances, so flash never leaks).
- `rig.squashKick(-0.08)` on windup or hit, `+0.1` on landing: volume-preserving spring on `body.scale` (k 300, c 17, overshoots once).
- `animator.hitStop(0.06)` drops time scale to 4 percent for that long; pair with camera trauma from fx.js.
- Secondary: `addCloak` (5x6 verlet grid, torso ellipse collision so it hangs behind), `addPlume` (flattened capsule chain, rest-shape pull 0.22), `addTassel`. Sim is in WORLD space with fixed 1/60 substeps; it needs fresh matrices (rig.update does it) and `rig.resetSecondary()` after a teleport or spawn, or the cloth stretches across the arena.

## Recipe: add a new weapon pose
1. Weapon mesh along +Y, grip at origin, optional `userData.gripB` Object3D for a second hand; add to `rig.joints.handR` (and `handL` for dual).
2. In `WEAPON_POSES` add `{name, weapon, twoHand, guard:{...sparse joints...}, attacks:{attack1:{wind,windHold,strike,follow}, ...}}` and rows in `ATTACK_TIMING`. A sparse pose is `{joint:[x,y,z], hip:[x,y,z] (hips offset), body:[x,y,z] (lunge, z forward), brot:[x,y,z], ground, lock}`; unspecified joints inherit the previous key.
3. Author guard first, then windup (mirror of the strike direction, deeper hip, back weight), strike (chest yaw +, forward lunge body z 0.2 to 0.35, front knee 0.9, rear leg extends), follow (about 10 percent past strike).
4. Check `?sheet=attack1&style=X&times=0,wind,wind+0.06,wind+strike,wind+strike+over,total&view=45`, then `?sheet=...&view=side` to verify the arc and that the weapon tip passes through the target zone at `hitAt`.
5. Two-handed: set `rig.animator.ik.hand = {target: weapon.userData.gripB, w:1, side:'L'}`, adduct the rear arm (shoulderR z about +0.4) so the shaft runs near the centreline, keep the wrist so the shaft stays near horizontal (elbowR about -1.6, wristR +0.25 at pull-back; a vertical spear in the windup looks wrong).
6. Shield on the forearm: use `mountOnForearm` (stabilised; face follows the forearm direction on the ground plane and height stays along body up). A plain child of the wrist flops flat whenever the arm hangs.
7. Add the style to `equipStyle`, run `?test=1`.

## Pitfalls found
- Wrong sign on yaw or pitch mirrors the whole attack: use the conventions above and `mirrorPose` for left-handed variants (it negates y,z of rotations and x of offsets).
- Hands can be unreachable (second spear grip was 1.2 m from the shoulder): slide along the shaft, adduct the rear arm.
- Initial `armed` is 0 and ramps in 6/s: a character spawned armed shows the weapon hanging for 0.3 s. Set `animator.armed = 1` right after `setWeapon` for spawns.
- Cloth and plume need `resetSecondary()` after posing offline (sheets, teleports) and `write()` to refresh geometry.
- Ground plant pulls hips down every frame: airborne clips must set `ground:0` or `lock` low, else jumps and runs look glued.
- Per-frame allocations: IK and flatten reuse module temporaries, keep it that way (20 fighters at 60 fps).
- Light attack while moving must use mask 'upper' or the lunge teleports the body forward under a running gait.
- Lathe seams: normals are rescaled after the elliptical scale, do not call computeVertexNormals on lathes (seam creases).
- Keep skin AO (`addAO` lo) at 0.9 on torso pieces or visible bands appear where chest meets abdomen.
- `hit` event is the only damage trigger; the sim must not time damage from its own attack timer or animation and gameplay drift apart when `speed` is changed.

## Wiring into the game (js/gladiator.js)
1. Factory: `createGladiator(sim unit)` = buildGladiator with palette from unit data, style gear from gear.js, laurel pips as small trim meshes on `chestFront`.
2. Each frame from fightview: `setMove(localVz, localVx)` from unit velocity rotated into facing, `root.rotation.y` toward target, `rig.update(dt)`.
3. Sim events to clips: attack start `play('attackN',{speed: ref.dur/sim.attackTime})`; on `hit` event apply damage, `hitStop`, camera shake; got hit `hurt(dir)` + `flash` + `squashKick(-0.08)`; blocking `play('block')` and `release()`; stun `setState('stun')` then `setState('move')`; knockdown `play('knockdown')` then `play('getup')`; kill `play('death')`; win `setState('victory')`; crowd taunt/cheer for ludus idle life.
