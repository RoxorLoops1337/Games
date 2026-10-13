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


## ROUND 2 DIRECTION: "Happy Light" (this overrides anything above that feels darker or moodier)
The target is the warm, bright, friendly, high-key cuteness of cozy life-sim games (think the Animal Crossing family of
looks, as a mood, not as assets: ORIGINAL designs only). When in doubt, make it rounder, brighter, softer and happier.

1. **High-key light.** No object may look dark or heavy. Shadows are lavender-teal and soft, never black or brown. Fake AO strength <= 0.18.
   Lightest value on top, midtones everywhere else. Colours are clean, saturated pastel candy: blush pink, butter yellow, mint, sky blue, peach, lilac, leaf green.
2. **Cheerful faces.** Characters: simple glossy dot eyes (big), tiny blush ovals, a clear happy smile, small button nose or none. Everyone looks friendly.
3. **Diverse people.** Five skin tones (peach, light, tan, golden brown, deep brown), all clearly lit and warm, never muddy or dark; deep brown must look as bright and happy as peach. Mix tones freely across a village. Varied body builds (round, tall, small), ages, and hair in warm browns plus fun colours (honey, ginger, lilac, pink, teal, white-silver). No near-black hair or clothes.
4. **Outfit variety.** Each villager wears a DIFFERENT happy colour (use `P.outfit` plus pastels); the owner colour appears only as a small accent (scarf, hat band, apron trim). Never a whole village in one colour.
5. **Everything has charm details:** flower boxes, bunting flags, round windows with curtains, lanterns, little signs, bees and butterflies, pastel plaster walls (pink, mint, butter, sky) with cream trim, wavy shingle rows, mushroom and flower accents, stepping stones, picket fences.
6. **Nature is soft and blossomy:** fluffy round trees, pink blossom trees, fruit trees, flower meadows in every corner, mushrooms, lily pads on turquoise water, clover and daisies in the grass, gentle sparkles.
7. **Animals are huggable:** big eyes, round bodies, tiny legs, visible smiles, blush. Add friendly extras (ducks, puppies, kittens, snails).
8. **Motion is bouncy:** squash and stretch, idle sways, happy hops. Nothing stiff.
9. **Same budgets and contracts as before.** Do not rename exported functions or named children; the game already uses them.
