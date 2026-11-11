# Animator guide: cutout and puppet walks, and characters in skirts, aprons and coats

Distilled rules for judging and fixing the Graftwork puppet walk (`ui/puppet.js`). Written after the owner saw floaty legs under the Candy Striper and Marrow aprons. Read it before touching a gait. No em dashes anywhere.

How this was researched: web search summaries of the sources below (the fetch tool could not open most hosts in the cloud session, so quotes come from the search results, and the Williams book chapter itself was not read: treat page numbers as pointers). Where a source did not say something, this guide says so.

## 1. What the owner saw and why

Legs hung BELOW the apron hem and pivoted at the hem line, with a feathered fade over the leg tops. Any swing then opened a wedge between hem and leg, so the legs looked detached. Professional rigs never show the hip joint: the garment is its own layer on top, the leg runs UP under it, and the pivot is a real hip hidden under cloth.

## 2. Rules (each with its source)

Garments and hips
1. **Hide the hip joint.** Legs start under the garment, the garment is a separate layer drawn over the leg tops. The cutout rig has the hip as the single connection between parts, and draw order (z) decides what overlaps. Sources: Godot cutout docs (hip as the root of the parts), Unity 2D Animation (Bone Depth sets which part is in front).
2. **Overlap generously.** Extend each leg part upward under the cloth by 14 to 22 percent of the figure height; clip it above the hem, so it can only appear below the hem line.
3. **Pivot at the real hip** (top of the extension), not at the hem. The visible leg then rotates about a point under the cloth.
4. **Garment = secondary motion.** A skirt, apron or coat tail lags the legs, never leads them. Cloth "follows through" with slower, smaller, delayed motion (12 principles: follow through and overlapping action). In a rig it is driven from the leg swing, either by actions on the leg bones (Moho forum), by Live2D physics inputs (a swinging-skirt group fed by body parameters) or by a sync-bone setup so the skirt rises when a leg lifts (KawaiiPhysics skirt tutorial). Our version: a sine lag of the leg spread (see `hemLag`), small amplitude.
5. **Test the extremes.** Spine's weight workflow says to start from extremes: pose the hips and legs at their widest and read the hem. We render the widest swing at large scale on a flat background and read it, and we run a pixel test (section 5).
6. **Legs cross, skirts do not** (Moho, Adobe Character Animator forums): a skirt between two crossing legs is the hard case. Either redraw per pose or keep the garment one rigid-ish layer with a swaying hem band. We do the second.
7. **Never fade the hem over a garment.** A feathered bottom edge is only right for bare legs. Over a garment keep the hem crisp.

The walk itself
8. **Contact, down, passing, up** (Richard Williams, The Animator's Survival Kit, the contact method): each step starts and ends on a contact pose. Down = body lowest, weight accepted. Passing = one leg under the body, the other swings through, body high. Course summaries describe 8 key poses per cycle (2 steps) and 12 to 16 frames per cycle: timing varies by source, the shape does not.
9. **Foot arcs.** The swing foot lifts and travels in an arc; the planted foot is on the ground and does not move relative to the ground. I found no source that gives numbers for the arc, so we measure lift (at least 6 percent of the figure) and clearance in tests.
10. **Heel-toe, weight, slow in and slow out.** The body is lowest after contact, highest at passing; ease the swing foot at both ends (`sstep`).
11. **Sliding feet are a math error, not an art problem.** The root must advance exactly one step length per step; if it advances more, the planted foot appears to slide backward (animation guide on stride control). Our planted foot is a constant in the ground frame, so ground speed is zero by construction, and `tests/graftwork_puppet.test.mjs` asserts it.
12. **Stride versus leg length.** Stride is a fraction of leg length (Softimage biped default 0.75 for average proportions). Step length scales with body size, about 42 percent of height for people.
13. **Cadence.** People self-select about 100 to 120 steps per minute (about 1.7 to 2 steps per second); step length changes with size, cadence much less. I found no source showing that short legs raise the preferred cadence, so this is our design choice, not a measured fact: a short-legged chibi takes a SHORTER step, and we allow a somewhat higher rate, about 2.5 to 3 steps per second at Normal, rather than the 5 to 7 the old pace produced.
14. **Arcs and spacing.** Everything swings on arcs. A straight slide of a limb reads as a puppet; a rotation about a hidden pivot reads as a leg.
15. **Do not overdo follow through** (Pixune, Animation Mentor notes): it distracts from the main action. Keep amplitude small and bounded; test it.

## 3. How we build it (ui/puppet.js)

- The standing sprite is analysed once from its alpha (hip row, valley). Parts: left leg, right leg, upper body, hem band (only when a garment hangs: `hangOf` measures the silhouette just above the hip against the two legs just below it, ratio 1.2 or more).
- Each leg part = [hidden extension | shin | boot], one canvas, three slices. The extension is filled from the leg's own cloth colour (horizontally blurred, a little darker toward the hip). The extension takes the stretch (up to +12 percent) and the squash (down to 50 percent) of a lifted foot; the shin takes up to +8 and down to -15 percent; the boot is never scaled.
- Pivot: `pu` = tuck, above the hip row. `geomOf` and `geomFor` give D0 = visible leg + tuck. Per actor override in `data/gaits.js` (`tuck`, `garment`, `hang`, or `tune`).
- Draw order: legs (clipped above hip row minus `CLIP_MARGIN`) then upper body then the hem band (a shear and stretch hanging from its top edge, so no seam can open).
- Lift is limited to 40 percent of the visible leg and the stride follows the reach of the swing limit, so a short leg takes a short step and the part never slides off its hip.
- Pace: `PACE` in `ui/ward.js`. Cadence = speed / (stride x figure height) (`cadence()` in puppet.js).

## 4. Judging a walk: numbers and filmstrips (checklist)

Numbers (all in `tests/graftwork_puppet.test.mjs`):
- [ ] Planted foot ground speed is 0 (limit 5 percent, by construction exactly 0).
- [ ] Feet alternate L R L R; a left foot leads at contact 0.
- [ ] Swing clearance at least 6 percent of the figure (short legs: 40 percent of the visible leg).
- [ ] Double support under 20 percent of the cycle, never both feet airborne.
- [ ] Stride = speed x period; stride within [0.2, strideMax]; a shorter leg takes a shorter step.
- [ ] Cadence at Normal 2.5 to 3.4 steps per second for the hero; Fast clearly quicker.
- [ ] Leg part never slides off its hip (dx under 0.04 figure heights).
- [ ] Garment: shear under 0.17, lag under 0.02 figure heights, zero at rest, zero when `garment` is 0.
- [ ] Pixel test: at every swing the figure is one connected piece and the legs run under the hem.

Filmstrip (use `/tmp/<scratch>/film.cjs`-style script: 12 phases over 2 steps, 6 per row, flat green background, then the extreme poses at 2x with a stress swing of 40 degrees, then the outline overlay):
- [ ] At every frame: leg meets garment with no green showing between hem and leg.
- [ ] No flat dark wedge or bar beside the garment (that is the hidden extension poking out: shorten `tuck`).
- [ ] The hem moves a little later than the legs, never before; no seam line across the garment.
- [ ] Boots are not stretched; no floating boot (a short leg under a long skirt: shorten the stride, not the tuck).
- [ ] Look for stray fragments of the sprite that ride along with a leg (fringe, a dropped item): they read as floating bits.

## 5. Sources

- Godot cutout animation (hip as root, z order): https://docs.godotengine.org/en/3.1/tutorials/animation/cutout_animation.html
- Spine weights view and weight workflows (test extremes, auto then manual weights): https://esotericsoftware.com/spine-weights and https://esotericsoftware.com/blog/Mesh-weight-workflows
- Unity 2D Animation (Bone Depth render order, auto weights, weight editor): https://unity.com/blog/engine-platform/getting-started-with-2d-animation-package and https://docs.unity3d.com/Packages/com.unity.2d.animation@4.2/manual/CharacterRig.html
- Live2D physics (input and output parameters, a swinging skirt group): https://docs.live2d.com/en/cubism-editor-manual/physics-operation/
- KawaiiPhysics skirt tutorial (sync bone: skirt lifts with the leg, legs penetrating the skirt): https://github.com/pafuhana1213/KawaiiPhysics/wiki/Tutorial-Skirt-en
- Moho skirt rigging (bind skirt points to waist and thigh, drive by leg actions): https://www.lostmarble.com/forum/viewtopic.php?p=218396
- Adobe Character Animator, walking in a long dress (draw the skirt per leg pose or dangle behaviours): https://community.adobe.com/t5/character-animator-discussions/walking-with-a-long-dress/td-p/9978523
- Clip Studio, basic walk cycle with the skirt as its own part: https://tips.clip-studio.com/en-us/articles/4285
- Walk cycle contact method, key poses and timing (Williams): https://animation.monmouth.edu/instruct/?p=351 and https://www.pluralsight.com/blog/tutorials/12-steps-walk-cycle-animation and https://learn.toonboom.com/modules/walk-cycle-animation/topic/walk-analysis1
- 12 principles, follow through and overlapping action: https://pixune.com/blog/follow-through-and-overlapping-action/ and https://www.gamedeveloper.com/production/the-12-principles-of-animation-in-video-games
- Stride control and foot sliding (the root advances one step length per step): https://download.autodesk.com/global/docs/softimage2013/en_us/userguide/files/GUID-533150CD-B20F-4E36-9351-9FEC0F91C740.htm
- Gait, step length and cadence: https://physio-pedia.com/Gait_Cycle and https://en.wikipedia.org/wiki/Effect_of_gait_parameters_on_energetic_cost
- Toon Boom, cutout walk cycle as an in-place loop moved by a separate tween: https://forums.toonboom.com/t/walkcycle-with-cutout-animation-method/5088

## 6. Rigs: a skeleton with painted parts (ui/rig.js, the preview)

The puppet cuts ONE painted figure in three. A rig has real parts (head, torso, arms, legs, boots, garment, prop) on a humanoid skeleton, so knees bend, arms swing and a prop is held. Everything in sections 1 and 2 still holds; this is how the rig keeps each rule. How a rig is built and added: ART_MODULAR.md section 7.

How it keeps the rules
- **Rule 1, 3 (hide the hip, pivot at the real hip).** The hip joints sit under the garment, a little above the hem (not at the waist: a long thigh pokes its knee out beside the cloth as a dark wedge when it swings). The garment parts are drawn over both thighs. `the_hem_covers_the_hip_joints_in_every_frame_of_the_cycle` checks every frame on three headings.
- **Rule 4, 15 (cloth follows, small).** A garment part hangs rigid down to its `hem` line and shears below it from the leg spread of `hemLag` steps ago (the puppet's formula); hair, feather, scarf and prop turn by a lagged copy of the body or arm swing (`lag`). Zero at rest, bounded in the test. **Cloth strips** (`RIG_TUNE.cloth`, on in the preview, off with reduced motion): below the hem line the garment is 8 horizontal strips on a chain of knots, the first one on the rigid hem line; on top of that shear the cloth trails back while walking (`billow`, more toward the hem), hangs against the body's lean (`hang`) and is pushed forward where the swing knee presses past its front edge (`kneePush`). Each strip is sheared from its upper knot to its lower one, so no seam can open. It is a few units at most: it reads in motion as follow-through, in a still as a hem that curves back. Cost: about 30 more canvas calls a frame per garment (marrow 70 to 130).
- **Rule 8 (contact, down, passing, up).** `poseRig` puts the body lowest just after contact and highest at passing, twice per cycle; the swinging knee folds because the foot is lifted (two-bone reach, knee forward).
- **Rule 9, 10 (foot arc, heel and toe).** The boot rolls: it lands on its heel edge, lies flat while the shin is within `flat` of upright, then goes over the toe edge, turning about the edge that is on the floor. A boot painted on the shin, or a leg painted in one piece, rolls with the leg.
- **Rule 11 (no sliding).** Each foot has a floor point that moves back exactly one stride per step while planted, along the real heading (both screen axes: the Ward walks its diamond floor down-right and up-right). The Ward's `gait()` divides the distance walked by the rig's own stride, so stride and speed cannot disagree. The test walks 4 seconds at the game's speed on three headings and reads the sole back from the drawn matrices: drift under 0.12 units (0.05 percent of the height).
- **Rule 12, 13 (stride and cadence).** The stride is the smaller of the tune (`RIG_TUNE.stride` x the character's `strideK`) and what the shorter leg reaches at `swing`. Short chibi legs cap it near 0.35 to 0.38 of the height: 3.2 to 3.6 steps a second at the Normal pace.
- **Rule 1 again: hidden limbs are long.** Every thigh is a full tube that begins inside the pelvis (ART_MODULAR.md section 7, "Rig sheet spec v2"). Where a sheet painted it short, the build grows it from its own pixels (`extend`, chosen by `--fit`: at least 35 percent of the hip to knee length above the hip, and long enough that its top end stays under what is drawn over it in every pose). The runtime pins the top end of every thigh in the hips (manifest `top`, `thighM` in ui/rig.js) and draws the thigh from there to the knee the reach solved: the knee, shin, boot and the planted sole are exactly where they were (the reach, the stride and the hip are unchanged; only the thigh's own angle under the cloth differs, a longer pendulum swings less), the hip slip only stretches hidden length, and the top end never leaves the body. Judge it in the Rig lab with X-ray: the garment at 35 percent, each limb end magenta; a magenta end outside the cloth is a bug. `rig` asserts it for 104 poses of every shipped rig.
- **The knee folds within a limit.** A foot close to its hip (lifted in the swing, or planted behind the body on a floor diagonal, where the reach is short) used to fold the knee up to 133 degrees: a short shin lay flat under the hem (Wick's pale stub) and the square trouser cuff stuck out behind the rolling boot (Marrow). `kneeCap` swings the knee about the ankle target until the drawn thigh and the shin meet at no more than `RIG_TUNE.knee` (69 degrees) x the character's `knee` (Wick 0.75) x the shin's share of the thigh (from three quarters: a short shin folds less). No foot moves. The build gives every two-bone thigh and shin a round end about the knee, and a shin standing in a boot of its own one about the ankle, so a bent joint shows no corner. `rig` checks the fold limit and that a swinging foot still clears the floor.
- **Reach.** A foot that the leg cannot reach is never dragged: the thigh stretches (hidden by the garment, up to `thigh`), the shin a little (`shin`), and what is left moves the hidden hip (`slip`, read it in the lab). Walking down the screen the reaching leg is longer and walking up it is shorter: that is the isometric foreshortening of a foot planted on the floor, not an error. Without a garment the thigh may only stretch to `bare`.

Tuning a rig (in the lab, Rig lab, then in the meta file)
- [ ] At rest it is the same person as the standing sprite beside it (drift: say so, and do not ship it).
- [ ] Walk, Level heading, Slow: feet alternate; a planted sole rides on its floor mark (slide readout 0); no foot floats.
- [ ] Down-right and Up-right: the leg reaches from under the hem with no gap at the hem and no detached piece (the Chromium test counts connected pieces).
- [ ] No dark wedge beside the cloth at passing: lower the hip joints (`at` of `legL_up`, `legR_up`).
- [ ] X-ray on: no magenta limb end outside the cloth in any frame on the three headings. If the fit stops ("the cloth over it is too small"), cut the garment layer higher (`rows` of the garment part) before asking the artist.
- [ ] Joints: no gap where thigh meets shin or shin meets boot at the widest swing (give the upper piece more overlap: a larger `s` or a lower pivot); no kink at the boot top.
- [ ] The head sits on the neck; hat and hair follow a beat late and never leave the head.
- [ ] The prop is in the hand the standing sprite holds it in, in front, and rides on that hand (`prop`, `lag`; `upright` for a flame or a tray).
- [ ] Arms swing against the legs; an arm that holds something swings less (`arms` in the meta file).
- [ ] Feel (`RIG_GAITS`): Marrow heavy (long stance, deep drop, forward lean), Wick light and quick (short quick steps, feet picked up), Odile gliding and upright (low feet, almost no bob, a straight back).

