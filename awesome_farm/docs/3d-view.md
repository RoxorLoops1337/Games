# Awesome Farm: The 3D view

Part of the Awesome Farm notes; the essentials are in [../CLAUDE.md](../CLAUDE.md).

## The 3D view (beta): `settings.view`, `world/view3d-bridge.ts`, `src/client3d/view3d.ts`

Players choose how the world is drawn: **2D** (the default, unchanged) or **3D (beta)**, on the title screen (the View toggle beside
Solo) and in Pause menu, Settings, World view. It is `settings.view` (`'2d' | '3d'`) in `awesome_farm_settings_v1`; anything else
stored there reads as 2D.
- **One game, two pictures.** The Game scene always runs: connection, state mirror, your movement, keys, targeting, placing, the HUD's
  questions. In 3D its main camera draws nothing (it still updates and follows, for culling and the 2D pointer) and `View3D` draws
  the same mirror. Never run a second Sim or a second connection for 3D, and never put game rules in `src/client3d`: the view only draws.
- **World overlays** (`world/overlay3d.ts`): the Game scene's own 2D overlays are laid onto the 3D ground, drawn by the same code: the
  status badges, the Factory view (L) and its dim, the inserter marks, the placement overlay (supply squares, wire reach, facing arrow),
  the blueprint copy box and paste outline, the dismantle outline and bar, fishing lines and the bite mark,
  swing arcs, monster marks, the Perfect ring, sorter and chute filter icons, chest tags, tunnel links. Mark such an object with
  `overlay3d(obj, lift?)` (the bridge); in 3D one extra Phaser camera per lift draws only marked objects. It copies the 3D camera after
  every frame (`View3D.groundView()`, measured through the camera in `client3d/groundview.ts`): an orthographic camera with no yaw maps
  the ground to the screen by an affine map, so a camera zoomed `sin(EL)` less down than across puts every overlay on its spot (a camera
  that turns about the vertical would break this). `lift` (tiles) raises one on screen as high as a thing that tall stands (badges: 0.9).
  Leave unmarked what a 3D model already draws (wires, inserter arms, belt items, the Titans' ring, badge and bar), or it shows twice. Painted by the 3D view itself
  (`client3d/marks.ts`, `wires.ts`): a boss's warnings in the 2D shapes and colours (circle, ring, cone, line; ice, curse and chain colours;
  the white flash), boss arenas, power wires hung from the pole models, and a ghost per piece of a pasted blueprint (`View3DFrame.paste`).
  `GameScene.viewRect()` is the world on screen in either view (culling, the Factory view's dim). `tests/overlays3d.test.ts`.
- **The real HUD on top.** The Phaser canvas is created transparent when the page boots in 3D (`transparent: settings.view === '3d'`
  in `client/main.ts`; every scene but the hidden Game scene paints its own background) and the three.js canvas sits exactly under
  it (`position: fixed`, same box, `pointer-events: none`). Every menu and screen is the 2D one. In 2D the canvas stays opaque, as before.
- **Switching:** live when the canvas is transparent (`canSwitchLive`); a page booted in 2D saves, writes the connection for one reload
  (`stashResume` in `net/connection.ts`, sessionStorage `awesome_farm_resume_v1`, removed when read) and reloads; the title screen
  (`takeResume`) goes straight back into the same world (solo, or the server with its password and secret word). `GameScene.setView`.
- **The feed** (`View3D` in the bridge, called by `GameScene`): `welcome` (a world arrived), `upsert` / `remove` (entities, as the
  tick carries them), `plots(changed, risen)`, `event` (every sim event, after the 2D handler: fx bursts, telegraphs, knocks, swings),
  `swing` (your own swing, before the server answers) and `frame(dt, View3DFrame)` once per Game update (farmers as the Game scene
  has them, camera target and zoom, clock and seed, the building in hand, the swing target). Sounds stay the 2D `Fx`'s (one table).
- **The input bridge** (`WorldPointer`): everything that turns the pointer into a place in the world goes through `GameScene.toWorld(p,
  out, aim)` (targeting, the ghost, drag lines, touch aim, blueprints, pings, factory tooltips) and back through `worldToScreen`
  (names, floats, plates, chat, the tutorial pointer). `Pointer2D` is the Phaser camera; `Pointer3D` raycasts onto the models
  (`aim`: a pointer over a tree picks the tree, via `entCenter`) or the ground plane. Keyboard and stick movement never touch it.
- **Bundle:** `src/client3d` and three.js are only reached through `import('../../client3d/view3d')` in the bridge, so 2D players
  download nothing extra (the 3D chunk is its own file in `play/assets`). `tests/view3d.test.ts` walks the static imports from
  `src/main.ts` and fails if one reaches `src/client3d` or `three`. In `src/client3d`, import from `client/` with `import type` only.
- **Models:** every kind needs a model of its own in `src/client3d/models`, with no placeholders: `src/client3d/coverage.ts` lists the
  families (building, node, monster, creature, item, projectile `SHOTS`, crop stage, boss pattern `PATTERN_POSES` in `mobs-attack.ts`,
  creature activity `WORK_PROPS` in `critters-work.ts`, character creator look, gear, co-op status `STATUS_MODELS`), each read from the
  shared data, and `tests/view3d.test.ts` fails for any kind without one (and when two look choices are drawn the same). A new
  building with state shows it through the model's `apply(e)` (called when it is made and on every change) and moves in `update(dt, t)`;
  the weather vane reads the seed and day from `env` (set by the view each frame).
- **Animations (entities):** monsters flash and squash when hit (`wrapRig`), and a boss's whole body follows its pattern (`e.pat` and its
  own clock, resynced to `e.pt`); creatures hold their activity's prop (`WorkSlot`, sized from the body); the farmer's `react(hearts,
  invuln, downed)` gives the hit flash and recoil, the invulnerable blink and the downed ring, and `status(co)` the ice block and wisps
  (the chain is `Entities.drawChains`); removed monsters shrink away and removed drops fly to the nearest farmer (`Entities.leaving`).
- **The world's mood** (`src/client3d/mood.ts`, one `frame` call from the view): the 2D NightLayer and Ambience told in light. It reads
  the same pure functions as 2D (`weatherAt`, `nightEvent`, `seasonOf`, the World's caves and Dread plots), never anything of its own.
  The caves (`caves.ts`: rock blocks `ROCK_H` tall with their fronts, ore nuggets and flecks with a faint glow, floor features; chunks
  streamed round the camera, a chunk rebuilt when `World.digs` moves and its rock changed; the surface `Terrain.landAt` is never true
  under `UNDER_Y`) go dark with the 2D depth tint (`caveTone`) and the light you carry. The Dread Reaches dim the day by 0.62 and add a
  violet veil. Seasons (`seasons.ts`) are a shader patch on the ground and on node models (opt in: `seasonGround`, `dressForSeasons`;
  greens are found by colour, so buildings, crops and monsters are never touched) driven by shared weights that glide, plus falling
  leaves, petals or snow. Lights (`glow.ts`) are the 2D light map's sources (`glowOf`; `tests/world3d.test.ts` checks the glowing
  monster and creature lists still match `Game.ts`): eight real point lights for the nearest, a ground pool for each, the dusk hearth
  circles. Fog banks, rain rings and the special nights' skies are `atmos.ts`; the rift gates `riftgates.ts`. A storm's lightning keeps
  the 2D night layer's timer and thunder (`View3D.lightning`). Terrain soups are drawn double-sided (their triangles are wound both ways).
- **The art pass** (2026-10-09; scorecard and screenshots in DESIGN.md, "Stage 2, the art pass"): the grade in `sky.ts` (`KEYS`: a
  moonlit slate night with a silver `MOON` instead of royal blue, a golden hour with lavender shade, rain as an overcast that greys,
  dims and drains colour; night and rain lower `saturation`); `contact.ts` (soft contact shadows under everything that stands, sized
  from the data by `contactSize`, at every quality level: the only grounding on Low, at night and in the caves); `impacts.ts` (event
  VFX over the juice bursts: a ring per action in the `RINGS` table, a flash for the big ones, dust at running feet; one instanced mesh
  each); `wet.ts` (rain darkens the ground and lowers its roughness through `groundMat`, dries slowly, and lays puddles mirroring the
  sky on open land); rain streaks lean with the wind and fade tail to head (`weather.ts`, `Rain.density` by level); the cave rock has
  a lighter lip where it meets the floor and the cave material darkens the floor by height. Low keeps contact shadows and the grade but
  drops puddles, dust and half the rain. `tests/art3d.test.ts`.
- **The Blight in 3D** (`tests/blight3d.test.ts`): a nest isle (`Plot.blight` 1) is ground of its own in `terrain.ts` (`BLIGHT_PAL`,
  `blightDecor`: bruised purple-grey soil, ooze, dead tufts, bones, stumps and rib cages baked into the chunk soup, and the smouldering
  cracks as one unlit child mesh per chunk, `veinMat`); the nest (`models/nodes-nest.ts`) reads its plot's level through
  `NodeOpts.level` and grows (`nestScale`, the 2D formula), darkens and sprouts eggs and spines by tier (`nestTier`, one baked mesh
  per tier and seed) and throbs (`nestBeat`); it smoulders in the dark (`glowOf`, a slow `pulse`).
  A raider (`MobE.rd`, not a flier) in the sea sinks to the waist (`Entities.wadeStep`, `View.wade`, `wadeDepth` from its radius; no
  contact shadow there) and leaves foam on the water (`wade.ts` `Wading`: wake rings, a collar, splashes off on Low); it carries the
  2D red raider light (`glowOf`, followed every frame and sunk with it). The 2D wading ripples are unmarked (2D only), since 3D draws its own.
  A hurt defense (any kind with `BuildingDef.hp`) shows its `BuildE.hp` (`models/b-damage.ts`: `buildingModel` wraps it in
  `withDamage`; cracks, then chips out of the cap, then crumbling, with rubble at its foot; one baked child per stage and shape, gone
  when it mends), and a break (`bldBreak`) is in the `FX` table with a ring, a flash and a cloud of dust (`Impacts`). Every Blight
  action (`nestHit`, `nestDie`, `nestSpread`, `raid`, `bedSet`, `unbind`) has its own burst, the big ones a ring. The rest (plates, nest
  rings, health bars) are the 2D overlays; the dusk warning and the minimap marks are HUD.
- **Coordinates:** the bridge speaks sim pixels (TILE = 16 per tile) and HUD units (960 x 540); the 3D view works in tiles
  (x east, z south, y up) with an orthographic camera at 62 degrees (`render.ts` `EL`, `BASE_VIEW` = 11.25 tiles tall at zoom 1 =
  the 2D view's classic distance). Zoom follows the 2D zoom steps (`GameScene.zoomLevel`).
- **The camera** (`src/client3d/camera.ts` `CameraRig`, pure maths, tested headless in `tests/camera3d.test.ts`): a follow that is the
  same at any frame rate (1 - e^(-7 dt)), fed `View3DFrame.cam` (`View3DCamera`) by the Game scene. **Shake:** the 3D view never starts
  a shake from an event; it copies the 2D camera's running shake (`shakeNow` in the bridge: Phaser moves the world by the juice
  table's pixels), so the `FX` table and "a friend's action never shakes your camera" hold in 3D with no second table. **Perfect
  beat:** the camera runs on real time (`realDt`) while the world crawls, pushes in by `SlowMo.punch` and drains a little colour.
  **Caves and warps:** when the followed spot goes underground (or back up, or jumps more than `WARP` tiles) the picture dips to
  black, cuts at the bottom, and comes back at the new place (`DIP`). **Photo mode** (F2, `Hud.setPhoto` -> `GameScene.setPhoto`):
  in 3D a drag turns and tilts the camera (`world/photocam.ts` `PhotoCam`, plain numbers on the 2D side), the wheel, + / - and a pinch
  zoom it, clicks do not swing, the ghost and target ring hide, and keys and the stick are turned with it (`moveYaw`, `screenToWorldMove`)
  so up the screen stays up. In 2D, photo mode is still only the HUD hiding.
- **Checking it in a browser:** `?profile=v3d` and `localStorage awesome_farm_settings_v1 = {"view":"3d"}` before the page loads boots
  straight into 3D; `__farm.scene.setView('2d' | '3d')` switches; `__farm.scene.view3d` is the view. Software GL (swiftshader) runs
  the 2D world at about 0.5 fps and 3D at well under 1 fps on a busy machine: stop the loop (`__game.loop.sleep()`), drive it with
  `__step(n, 100)` (keys held with Playwright's keyboard in between), and give screenshots long timeouts. The character creator opens
  over a new farmer's first world and blocks the keys: send a `look` command and `closeScreen()` first.
- **The budget** (`src/client3d/quality.ts`, `batch.ts`, `budget.ts`): `settings.quality3d` (`'auto' | 'low' | 'medium' | 'high'`, the
  button left of 2D/3D in Settings) reaches the view as `View3DFrame.quality` and sets pixel ratio, shadow map, glow, multisampling, lamps
  and ambient life live (`QUALITY`; Auto by device, `resolveQuality`, and `AutoStep` steps down on slow frames). Instancing is automatic for
  meshes from `bake()` (cached geometry + shared opaque material, render order 0): a new model that builds with `bake` and shares its
  materials is instanced for free; a per-instance geometry, a cloned or see-through material or a custom `renderOrder` is drawn one by one.
  The view updates world matrices itself once a frame (`scene.matrixWorldAutoUpdate` is off) and only for shown models. The `Ledger`
  disposes everything the renderer drew when the view goes, and a removed model's one-off geometry at once (`bake` marks its geometries
  `userData.cached`, which stay). `__farm.scene.view3d.perf` gives the level, draw calls, triangles and batch counts of the last frame.
- **Still to do for parity** (a list per area: WORLD, ENTITIES, OVERLAYS, CONTROLS, PERF) is in DESIGN.md, "Two views of one world".
