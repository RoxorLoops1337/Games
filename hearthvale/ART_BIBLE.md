# Hearthvale Art Bible

Goal: the cutest, most readable cozy-builder look a phone can run. Think chunky toy figures on a sunny diorama:
bright, warm, rounded, soft-lit, instantly readable from the game camera (about 25 to 35 units away, 50 degree pitch).
All art is procedural three.js geometry (no image files). Original designs only: take inspiration from the whole genre
of cozy mobile village builders, never copy a specific game's characters, buildings, logos or assets.

## The look (the 10 rules)
1. **Rounded everything.** Use `rbox`, `capsule`, `ball`, `lathe`, `blob`. Hard 90 degree box corners are a bug. Bevel radius about 6 to 10 percent of the smallest side.
2. **Chunky proportions.** Thick walls, oversized roofs that overhang, big doors and windows, stubby chimneys. Characters: head about 45 percent of body height, tiny hands, no neck.
3. **Silhouette first.** Every object must be recognisable as a solid black shape at 40 px. Give each building ONE signature shape (mill: sails, kiln: dome + stack, study: tower, market: striped awning).
4. **Saturated warm palette from `art/palette.js`.** Roofs are the colour accent (red, orange, blue, teal, purple, pink, gold). Walls cream. Never pure black, never pure grey; shadows read blue-green, light reads warm.
5. **Soft light, fake AO.** Materials are matte (`soft`). Add `bakeAO` or `groundShadow` so things sit on the ground and never float. Roof undersides and wall bases are darker.
6. **Three colour values per object:** light (top), mid, dark (underside). A flat single colour looks cheap.
7. **Details that tell the story:** smoke from chimneys, bunting, flower boxes, crates, barrels, hanging signs, lanterns, round doors with iron hinges, stone foundations, planks with visible gaps (small dark boxes). Detail clusters near doors and corners, calm elsewhere.
8. **Foliage as clumps.** Trees are 3 to 5 overlapping `blob` clumps on a tapered trunk, light on top, deeper below, with a few lighter leaf-clump highlights. Never cones stacked like Christmas trees (one pine type is fine).
9. **Life.** Everything that can move gently, does: sails turn, flags wave, chimney smoke, bobbing lanterns. Animated parts must be NAMED children so the game can drive them.
10. **Budget.** Building <= 2500 triangles, villager <= 1800, tree <= 900, prop <= 400. After building a model call `mergeStatic(group)` so a finished building is <= 12 meshes. 16 villages with 40 buildings each must run on a phone.

## Scale
1 unit = 1 tile. A building footprint of W x H tiles is W x H units; keep the model inside it (0.1 margin). Origin = centre of the footprint on the ground (y = 0). A villager is about 1.0 unit tall (small next to a 2x2 cottage that is about 2.2 tall including roof). Hall is 3x3.

## Palette and materials
Colours: `import { P } from './palette.js'`. Materials: `soft(color)` (matte), `gloss(color)` (water, glass). Emissive things that glow at night (windows, lanterns) must use the shared `windowMat` / `lanternMat` exported from `art/buildings.js` so the day/night code can drive their `emissiveIntensity`.

## Contracts the game relies on (keep these names)
- Named children the game animates: `spin` (rotate about X, sawmill blade), `spinz` (rotate about Z, windmill sails), `crops` (farm), `body` and `arm` (villager: body.position.y bob, body.rotation.z sway, arm.rotation.x work swing, body.scale.y squash), `flag` (waves).
- Smoke anchor: an empty named `chimney` at the top of each chimney (game spawns puffs there).
- Level markers: `userData.topY` on the building root = height where the game puts upgrade stars.
- Builders take `info = { id, color, lvl }` (`color` = owner's colour, `lvl` 1..3: level 2 and 3 add visible richness: extra trim, banners, bigger roof, gold details), and return a `THREE.Group`.

## Lab workflow (how you review your own art)
1. `python3 -m http.server 8123 --directory hearthvale` (already running if port answers).
2. Build `hearthvale/lab/<yourpage>.html` using `lab/stage.js` (see `lab/_check.html`).
3. `node hearthvale/lab/shot.mjs <page>.html out.png "yaw=0.5&pitch=0.6&dist=9&x=0&z=0" 1000 700` then LOOK at the PNG (Read it). Judge it against the 10 rules. Iterate at least 5 rounds: wide shot, close-up, game-camera shot (`dist=30&pitch=0.9`), night shot (`night=1`).
4. Compare against the references you researched. Fix what looks off, not what you already like.
