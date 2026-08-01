# EMBERKIN — creature art brief

Every creature in the game is a 40×40 character grid plus a palette, stored as
JSON in this folder and embedded into `emberkin/index.html` by
`node tools/spritegrid/embed.mjs`. One file per creature.

The look we are going for, in one line: **cute enough to want one, armed enough
to respect one.** Big readable head, big eyes, soft body — and then exactly one
feature that tells you it can hurt you.

## File format

```json
{
  "id": "cindercub",
  "name": "Cindercub",
  "palette": { "K": "#2a1b2e", "o": "#ef6a2b", "b": "#ffa33c", "h": "#ffd98a", "w": "#ffffff" },
  "rows": ["........................................", "... 40 rows total ..."]
}
```

- Grid is exactly **40 rows × 40 chars**. `.` is transparent.
- Palette keys are single characters, values `#rrggbb`. Max 16 colors.
- Suggested key convention (keeps files readable): `K` outline, `d` deep shade,
  `m` mid, `b` base, `h` highlight, `w` white, `e` eye, `c` cream/belly,
  `a` accent, `g` glow.

Render and **look at your work**:

```bash
node tools/spritegrid/render.mjs emberkin/art/cindercub.json --out /tmp/art --scale 8
```

Then `Read` the PNG. You can see it. Do not skip this — judge with your eyes,
not from the character grid.

## Hard rules

1. **40×40, feet planted.** The creature's lowest pixel sits on row 37–38 (0-indexed),
   leaving a row or two of air at the bottom. Keep 1+ column of margin left and right.
2. **Fill the frame by rank.** Stage 1 ≈ 22–26 rows tall, stage 2 ≈ 28–32,
   stage 3 / legendary ≈ 34–38. Size difference between evolutions must be obvious.
3. **Every filled pixel that touches transparency is outline.** The silhouette
   gets a full 1px dark outline, no gaps, no leaks.
4. **Never pure black.** Outline is `#2a1b2e` or a darker tint of the creature's
   own hue. Never `#000000`.
5. **Light comes from the upper left.** Highlights top-left, deep shade
   bottom-right, and an interior shade line where forms overlap (under the chin,
   under the belly, where a limb crosses the body).
6. **Three tones minimum per material** — base, shade, highlight. Flat fills read
   as programmer art.
7. **Read the silhouette.** Render at `--scale 3` and squint: the pose and species
   must still be identifiable as a black shape. If it reads as a blob, redesign.
8. **No noise.** No isolated stray pixels except deliberate sparks/catchlights,
   no checkerboard dithering.

## The style

- **Front view, 3/4 lean.** Facing the viewer, weight shifted slightly to one
  side. Never perfectly mirror-symmetric — put one asymmetric detail (a chipped
  horn, one raised claw, a scar, a curled tail to one side) on every creature.
- **Cute half:** head is large relative to body (roughly 1/3 of total height on
  stage 1, less as it evolves), eyes are big, rounded, with a **white catchlight
  in the upper-left of each pupil**, and a soft belly in cream `#f7e6cf`.
- **Dangerous half — mandatory, exactly one or two, never zero:** fangs, hooked
  claws, a spike crest, a barbed tail, a glowing sigil, an ember vent, a cracked
  stone plate. On stage 1 it should be small and a little funny (one tiny fang);
  by stage 3 it should dominate the silhouette.
- **Type rim light.** A 1px line of the type's brightest ramp color along the
  upper-left edge of the body, so each creature glows faintly in its element.
- **Eyes carry the mood.** Cute = tall rounded pupil, lots of white. Dangerous =
  narrow pupil, colored sclera, a heavy brow line. Evolutions should visibly
  shift from the first toward the second across a line.

## Palette ramps (use these — they are what makes the roster one world)

Shared: outline `#2a1b2e`, belly/cream `#f7e6cf`, eye white `#ffffff`,
pupil `#2a1b2e`.

| Type    | darkest   | deep      | base      | light     | brightest |
|---------|-----------|-----------|-----------|-----------|-----------|
| Ember   | `#6d1a1c` | `#b8371f` | `#ef6a2b` | `#ffa33c` | `#ffd98a` |
| Tide    | `#14306b` | `#1f5fae` | `#35a8dd` | `#7fe0f5` | `#d8fbff` |
| Verdant | `#17442c` | `#2f7a3a` | `#5cb340` | `#a8e05f` | `#ecffb8` |
| Spark   | `#7a3f13` | `#e08a12` | `#ffc21e` | `#ffe45c` | `#fff9c4` |
| Gloom   | `#241844` | `#4a3383` | `#7a5fc4` | `#b39ae8` | `#e6d9ff` |
| Stone   | `#33231d` | `#5d4436` | `#93765f` | `#c4ab97` | `#efe6dc` |
| Aether  | `#3d2a7a` | `#b46bff` | `#ffa8dd` | `#ffe9f6` | `#ffffff` |

Dual-type creatures use the primary type's ramp for the body and the secondary
type's ramp for the accent feature (horns, flames, vines, glow). You may add up
to two off-ramp colors per creature for a signature detail.

## Working method (follow it, it is the difference between good and mush)

1. Block the **silhouette** only, in outline color. Render, look, fix the pose.
2. Fill flat base color. Render, look — is it still the animal you meant?
3. Add shade and highlight. Render, look.
4. Add face, then the dangerous feature. Render, look.
5. Final pass: outline gaps, stray pixels, rim light, catchlights.

Minimum three render-and-look cycles per creature. A creature that was never
rendered is not finished.

## Common failures (these are the ones that actually happened)

Every rejected sprite in this project failed in one of these ways. Check your
render against this list before you call anything done.

1. **The fuzz-ball.** A round mass of one hue with a face sunk into it. If you
   cannot point at the head, the body, and the limbs as separate shapes in the
   silhouette, it is a blob — rebuild the silhouette, do not paint over it.
2. **Floating parts.** A tail, an arm, a held object or a plug drawn beside the
   creature with a gap of transparency between them. Every part must physically
   connect to the body, or be so close it obviously belongs.
3. **One value everywhere.** Base and shade only a step apart, so the form is
   flat. Push the deep shade *much* darker and keep the highlight small.
4. **Face soup.** Eyes, nose, mouth and teeth all crowded into six rows with no
   clean skin between them. Give the face air: eyes with a gap between them,
   a mouth two or three rows below, not touching.
5. **Teeth that eat the face.** Big white rectangles read as a grill. Keep fangs
   to 1–2px, pointing down from the upper lip, with dark around them.
6. **Legs that dissolve.** Limbs that fade into the ground or end in a smear.
   Each leg needs an outline, a lit side and a foot.
7. **Wrong element.** Spark drawn as flame, Verdant drawn as generic green mass.
   The type's shape language matters: Spark is angular and jagged, Ember is
   licking and curved, Tide is smooth and finned, Verdant is leaf-and-thorn,
   Stone is blocky and cracked, Gloom is soft-edged and furred.

## Match the roster

Six sprites in this folder are finished and set the bar: `cindercub`,
`pyrelynx`, `magmane`, `brookite`, `mothrix`, `nocthorn`. Render them, look at
them, and match their level of finish — the way they separate head from body,
how dark the deep shade goes, how small the highlights are, how much air the
face gets. New work that looks softer or flatter than those is not done yet.

## Evolution lines

Within a line, keep a shared **design DNA** — the same eye shape, the same marking
motif, the same accent color — so the line reads as one creature growing up, then
push proportions: stage 1 chunky and top-heavy, stage 3 taller, leaner, armed.
