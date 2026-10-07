# Park3D: low-poly 3D park test (production plan)

Goal: a gorgeous, walkable, low-poly 3D version of the Beatbox Heroes park, running in the browser on phones (three.js), with glowing spots where the
activities and mini games start. If the owner likes it, the same kit becomes the look of every place in the game.

Style target: golden-hour miniature diorama. Faceted flat shading, hand-painted vertex colours (hue-shifted shadows, warm key light, cool violet fill),
soft shadows, atmospheric fog, bloom on lamps and neon, tilt-shift depth feel, chibi characters with big readable heads. Not "primitive soup": every prop has
a silhouette, a story and a bit of grime.

## Team and ownership (one owner per file, nobody edits another owner's files)

| role | files | delivers |
|---|---|---|
| Studio lead (Claude) | `main.js`, `kit.js`, `palette.js`, `PLAN.md`, `park3d.html`, build and shot tools | scaffold, integration, reviews, devlog, merge |
| Research lead | `scratchpad/lowpoly/research.md` | style bible and tech playbook |
| Environment Artist A (terrain and architecture) | `terrain.js`, `terrain_*.js` | ground, paths, plaza, fountain, fence and gate, brick graffiti wall, lamps, benches, busking crate stage and amp, run track |
| Environment Artist B (nature and world) | `flora.js`, `flora_*.js` | trees, bushes, flowers, grass, skyline, clouds, pigeons, litter, planters |
| Character Artist and Animator | `characters.js`, `char_*.js` | customisable low-poly characters and animation clips, BeeAmGee NPC |
| Lighting and VFX Artist | `lighting.js`, `fx_*.js` | sky, sun, shadows, fog, bloom, grade, lamp cones, god rays, fireflies, music notes |
| Gameplay and UI Engineer | `controls.js`, `spots.js`, `ui3d.js`, `park3d.html` | camera rig, tap to move with A*, joystick, spots, prompts, bridge events |

## World map (metres; +z toward the camera start, park about 36 x 56)

* Gate and iron fence on the south edge (z about +26), flyers corner at (4, 22).
* Main path runs from the gate north to a round plaza at the centre with the fountain at (0, 0).
* Brick graffiti wall along the north edge (z about -26): BEAT BOX mural, neon strip.
* Bench cluster west at (-9, -4) facing the plaza: BeeAmGee sits with his boombox.
* Busking crate stage with amp at (8, -8): a lit spot of light on the ground.
* Run loop: an oval path around the lawns, start marker at (12, 14).
* Big trees frame the lawns; lamp posts every 8 m along paths; skyline behind the north wall and over the sides.

## Spots (the interaction layer)

`busk`, `bench` (rest, talk to BeeAmGee, lesson), `run`, `flyers` (odd job), `gate` (leave to the street). Each has a glowing ring marker on the ground,
a floating icon, and a prompt button when the player is close. `ctx.events` emits `spot` with `{id}`; main.js maps spots onto the real game actions later.

## Budgets (mid-range phone, 60 fps target, 30 fps floor)

* Whole scene <= 150k triangles, <= 120 draw calls (merge and instance), <= 8 textures.
* One directional shadow map (1024 on phones, 2048 on desktop), PCF. DPR cap 2 (1.5 on 'med').
* Post: half-resolution bloom only. Quality tiers 'low' | 'med' | 'high' switch effects off, never geometry.
* Characters <= 3.5k triangles each. Foliage instanced.

## Milestones (each ends with screenshots for the devlog)

1. M0 scaffold (done): build pipeline, shot tool, module contracts.
2. M1 blockout: terrain layout, trees, character walking, camera, spots. Everything readable, no polish.
3. M2 art pass: palette, props, vertex-colour painting, characters with looks and animation.
4. M3 light pass: golden hour, shadows, bloom, lamps, god rays, grade.
5. M4 gameplay pass: tap to move, joystick, spot prompts, NPC, activation events, perf tuning, tests.
6. M5 review and polish: pro checklist from the research, owner feedback.

## Rules for everyone

* Use `flatMat()` and `paintGradient()` from `kit.js` for the house look. Vertex colours, no image textures except canvas-drawn murals and signs.
* Never leave a module throwing: main.js guards each module, but a broken module means a blank part of the park.
* Look at every render (shot3d.mjs) and critique it. No pure black, no pure white, no default grey.
* No em dashes anywhere.
