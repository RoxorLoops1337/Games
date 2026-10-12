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

---

# Update: character polish pass (game code in `ludus_maximus_3d/js/`, source of truth; `lab/ref` is frozen history)

Files: `js/rig.js` (body, head/face/hair, materials, skinning, Animator, cloth), `js/gear.js` (weapons, shields, helms, armour, rarity accents, laurels, `equipStyle(rig, style, o)`), `js/gladiator.js` (`createGladiator(unitOrGlad, opts)`, `lookFor(g, style)`). Labs: `lab/char_lab.html` (showcase) and `lab/rig_test.html` (headless checks, 543 of them, must say PASS).

## How the rig is drawn now (draw calls 100 -> 10..13 per fighter)
- Every static part is authored as geometry in the local frame of a joint, socket or holder and queued with `rig.add(matKey, geo, obj)` (geometry is cloned and baked to the REST pose). `rig.rebuild()` merges the queue per material into ONE `SkinnedMesh` per material, rigid weights (one bone per vertex), one shared `THREE.Skeleton` whose bones are the existing joint Object3Ds (names, sockets, pivots unchanged, so Animator, IK, hit flash, squash all work). Skinned meshes live under `rig.root` (not `body`), `frustumCulled=false`, bind matrix identity. `equipStyle` ends with `rig.rebuild()`.
- Extra bones: `rig.addBone(obj)` (the shield holder is one, its orientation is set every frame by a `postUpdate` stabiliser, so the shield geometry is skinned to it and still follows the arm while staying readable).
- Weapons: empty `Object3D` in `handR/handL` socket (carries `userData.tip`, `gripB` for the spear IK) plus geometry baked to it. Never reuse a geometry object after `rig.add` (it is cloned, but `xf/paint` mutate in place).
- Still separate meshes: cloth (`ClothGrid`: loin flaps with thigh collision, cloak, plume ribbon, retiarius net with diamond alpha texture, `net.setAnchor(obj)` to throw it later), shield face (own textured material, skinned to the holder).
- Materials per rig: skin, hair, cloth, plume, leather, metal, trim, steel (blades), eye (= face decal), gem (emissive rarity stones), plus `shield` and `net` via `rig.addMaterial(key, mat, shadeKind, {back})`. All use vertex colours (AO and paint multiply the base colour; every geometry needs a `color` attribute: use `col1/paint/xf` helpers). `uv` is merged too (needed by the shield).
- Character-only shading lives in the material shader (`shadePatch`, `SHADE` table): sky/ground fill + albedo independent lift (dark skin never goes black), cool narrow fresnel rim, warm subsurface-ish bleed on skin, dark edge term (separates fighters from bright sand), faux sky/ground reflection so metals work with no env map (the arena has none). No scene lights were added. `customProgramCacheKey` per kind; `onBeforeCompile` runs per material, so uniforms are baked as constants.
- Legendary / epic: `rig.setGlow(hex, base, amp, speed)` drives the gem material emissive (`update()` pulses it); metal tint = best rarity (`metalFor`), per-slot accents: weapon inlay + pommel gem, shield boss gem and rim gems, helm brow gem (legendary: gold wings / ring), armour gem, charm pendant.

## Geometry kit (rig.js exports)
`lathe(profile, seg, sx, sz, ao, lo, phi0, phiLen)` (partial sweeps; phi 0 = +Z, so a front mask is `-len/2`), `capsule(len, rTop, rBot, seg, bulge, topCap)`, `boxG, sphereG, cylG, coneG, torusG, quadG`, `xf(geo, pos, euler, scale)`, `paint(geo, rgb|fn(x,y,z,nx,ny,nz))`, `sculpt(geo, blobs)` (gaussian bumps along normals), `ribbon(points, width, normalFn)` (straps follow the chest), `tabRing` (pteruges), `extrude(outline, depth)` (crests, flanges), `faceTexture`, `shadePatch`.
Face: 14-ish ring skull lathe sculpted per variant (`FACES[0..2]`: square jaw, lean cheekbones, rugged + scar), painted eyes/brows/mouth/nose shading in a cached canvas decal on a 48 triangle patch, pyramid nose, ears, beard (0 none, 1 short, 2 full), hair `short|crop|long|tied|bald`. Under a visor the face shows through the eye window (helms are a cap + a rear bowl, open at the front).

## Budgets (tests enforce: tris <= 2500, draw calls <= 14)
Bare body with hair 1300 to 1500 tris. Dressed worst case (all legendary, full beard): murmillo 2343, retiarius 2127, thraex 2383, hoplomachus 2265, dimachaerus 1939; typical 2000 to 2250. Draw calls 10 to 13. Update cost 0.14 ms per rig frame, build 9 ms per rig. Savings that paid for detail: open-ended limb capsules (no hidden caps, -144), no pole rings that sit inside other parts, quads instead of boxes for flat trim, painted features instead of geometry.

## Shield rules
Holder at the fist (`wristL` + (0,-0.07,0)); scutum = cylindrical section (R 0.46, 0.62 x 0.98), rounded-rectangle outline, lip + edge-wall rim ribbons, domed boss, grip bar and straps, emblem canvas (winged thunderbolt in the tunic colour, cached per colour); parmula = small curved square with a sun-disc emblem. The shell is shifted 0.1 toward the body centre so it covers the torso. Back faces are painted bare leather in the shader (`xo.back`), so no back shell is needed.

## Pitfalls found in this pass
- `-(expr) ** 2` is a SyntaxError (module fails to load everywhere): use a `sq()` helper.
- Shells over the chest must use the same radial segment count as the chest lathe (12) or facets interleave and poke through; offsets for straps/laurels on a faceted, sculpted chest need >= 0.026.
- `DoubleSide` materials flip normals by winding: ribbon/tab/quad winding must be CCW seen from the normal side, or lighting inverts.
- Merging geometry drops attributes you do not copy (the shield texture showed as one texel until `uv` was merged).
- `onBeforeCompile` only runs when a material first compiles that variant: bake constants into the GLSL, give each kind its own `customProgramCacheKey`.
- Bind the skeleton with explicit inverses from the REST pose (`rig.restOf`), never from the current pose, and never call `SkinnedMesh.bind` without a bind matrix (it would recompute from the posed bones).
- Hair cap hairline: lower the bottom ring at the back and over the ears or it reads as a swim cap.

## Recipes
- New helm: `helmShell(rig, head, R, top, yBowl, yCap)` then visor masks (`mask`), `faceBars`, crest via `extrude(...)` rotated `[0,-PI/2,0]`.
- New armour piece: author in the joint frame, `rig.add('metal'|'leather'|'trim'|'cloth', geo, rig.joints.chest)`, check `chestR/chestPt` for surface offsets, then run `lab/rig_test.html` and `char_lab.html?view=grid`.
- Lab params: `view=grid|close|one|three|turn|heads`, `pal`, `style`, `rar`, `lvl`, `rot`, `spin=1`, `pose=<clip>&t=<s>`, `cam=x,y,z,tx,ty,tz`, `fov`, `sun`, `az`, `face`, `hair`, `beard`. Shot: `node tools/3d_shot.mjs "http://127.0.0.1:PORT/ludus_maximus_3d/lab/char_lab.html?view=grid" out.png --w 1500 --h 900 --secs 1`.
