---
name: 2d-animator
description: Professional 2D cutout and puppet animator for this repo (Graftwork). Use when judging or changing a walk cycle, leg or garment motion, stride and cadence, foot sliding, apron or skirt or coat follow-through, the animation lab (graftwork/lab/anim.html), ui/puppet.js, data/gaits.js, or when an owner says legs look floaty, detached, too fast or sliding.
---

# 2D animator (cutout and puppet walks)

Full guide with source links: `graftwork/design/ANIMATOR_GUIDE.md` (read its section 5 for the URLs). No em dashes anywhere. Never touch `graftwork/assets/`, `tools/graftwork_art_*.py` or ART_SYNC from an animation task.

## Project facts
- `graftwork/ui/puppet.js`: the puppet walk. Pure math in figure heights (H = opaque height of the sprite): `analyseAlpha`, `classify`, `geomOf` and `geomFor` (D0 = visible leg + tuck), `strideOf`, `liftOf`, `cadence`, `walkPuppet(phase, speed, kind, tune, out, geom)`, `legSolve`, `footPoint`, `tuneFor(id)`; parts: `prepare`, `partsOf`, `hangOf`, `buildParts`, `drawLegged`. `TUNE` holds swing, lift, bob, sway, lean, twist, squash, duty, strideK, tuck, garment, hemLag, strideMax. `DEBUG.outlines` draws the slices.
- `graftwork/ui/rig.js`: the older procedural humanoid skeleton (capsule placeholder rig); the puppet is what the Ward draws.
- `graftwork/data/gaits.js`: per actor `gait`, `split {hip, valley}`, `minHip`, `tune`, and short forms `tuck`, `garment`, `hang`. Actors with a gait entry win over the alpha analysis.
- `graftwork/ui/ward_iso.js` (`drawActor`, `gait`) drives it; `graftwork/ui/ward.js` `PACE` sets seconds per room (Normal 1.1, Fast 0.65, reduced 0.12). One room = one cell step of about 52 world px; the hero is 44 px tall.
- Lab: `graftwork/lab/anim.html` (script `anim.js`): Puppet walk group has Leg swing, Tuck/overlap, Garment sway, Stride cap, Lift, Bob, Sway, Lean, Twist, Leg outlines, Leg split overlay (pink = pivots), foot slide meter and L/R planted pads.
- Tests: `tests/graftwork_puppet.test.mjs` (numbers plus a Chromium pixel test of a synthetic skirt; it skips without Chromium), `tests/graftwork_ui_ward.test.mjs` (pace numbers), run all with `node tests/run_graftwork.mjs`. Never `npm run check`.
- Filmstrips: serve the repo (`python3 -m http.server 8741` from the repo root), load any same-origin page, `import('/graftwork/ui/puppet.js')` in `page.evaluate`, `PUP.prepare(img, id, dev, tune)`, `PUP.partsOf(e, dev, tune)`, `PUP.walkPuppet(...)`, `PUP.drawLegged(g, parts, pose, s, anchorX, anchorY, w, h, H*h)`; draw on a flat green background so any gap shows; save screenshots only under the scratch shots folder, never in the repo; READ them.

## Rules (sources in the guide)

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


## Procedure for a walk complaint
1. Reproduce in the lab or with a filmstrip (12 phases, extreme swing at 2x, outlines on). Name what you see: gap, bar, floating boot, sliding, speed.
2. Judge from numbers first (checklist in the guide section 4), then from the strip.
3. Fix the cause in puppet.js or the actor's gaits entry (tuck, garment, hang, minHip or split, tune), not by faking a frame.
4. Write the test so it FAILS on the old code first (git show an old revision of the file, run, restore), then passes.
5. Run `node tests/run_graftwork.mjs`. Report honestly what still looks wrong per actor.
