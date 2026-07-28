# BLACKSITE — architecture & module contract

A first-person shooter in Three.js. One static folder, no build step, no runtime
CDN: `index.html` declares an importmap pointing at `vendor/`, everything else is
a plain ES module under `src/`.

    blacksite/
      index.html          shell, CSS, HUD markup, importmap, boot
      vendor/             three r180 (module+core, minified) + a few addons
      src/
        core/             state, constants, input, timing — no Three.js imports
        render/           renderer, sky/IBL, materials, lighting, post-processing
        world/            level layout, prop geometry, collision
        game/             player, weapons, ballistics, viewmodel, AI, director
        fx/               particles, decals, tracers, impacts
        audio/            WebAudio synthesis + spatialisation
        ui/               HUD, menus, settings

## The two hard rules

1. **Import-time purity.** A module must not touch `document`, `window`,
   `AudioContext` or WebGL when it is imported. Everything DOM- or GPU-shaped
   happens inside a `create*()`/`init()` call. This is what lets the headless
   suite `import()` game logic straight into Node and drive it without a browser.
2. **Graceful degradation.** Every visual feature checks its own support and
   falls back. A missing float render target, a failed shader compile or a low
   quality tier must never leave a black screen — the game drops the effect and
   keeps running. Same rule the rest of this repo uses for art.

## The state object

`core/state.js` exports `createState()`, which returns the whole mutable world
as one plain object, `G`. There is no module-level singleton: two calls give two
fully independent games, which is how the tests run a simulation without a page.

    G.time      { t, dt, frame, scale }        seconds; dt is already clamped
    G.input     { move:{x,y}, look:{x,y}, buttons:Set, pressed:Set }
    G.player    { pos, vel, yaw, pitch, hp, stance, grounded, ... }
    G.weapons   { slots:[], active:0, byId:{} }
    G.enemies   []                             plain data, no Object3D
    G.world     { statics:[], nav:{}, bounds }  collision + AI read this
    G.events    []                             append-only, drained each frame
    G.settings  { quality, fov, sens, ... }
    G.stats     { kills, shots, hits, damage, ... }

Rendering reads `G` and never writes to it. Simulation writes `G` and never
touches an `Object3D`. Keeping that line clean is what makes the sim testable
and the renderer swappable.

## Frame order

`main.js` runs a fixed-step accumulator at 120 Hz for simulation, with render
interpolation, capped at 5 steps per frame so a stalled tab cannot spiral:

    input.sample() → for each step: player → weapons → ballistics → ai →
    director → physics → fx.step → drain G.events → render.frame(alpha)

## Events

Simulation never calls into audio, FX or HUD directly — it pushes onto
`G.events`, and the presentation layer drains the queue once per frame. That
keeps a headless run from needing an audio stack, and it is the seam the tests
assert against.

    { type:'shot', weapon, origin, dir }
    { type:'impact', point, normal, surface, energy }
    { type:'damage', target, amount, part, source }
    { type:'kill', target, weapon, headshot }
    { type:'reload', weapon, phase }
    { type:'step', pos, surface, sprint }

## Quality tiers

`G.settings.quality` is `0..3` (potato → ultra). Each render module reads it and
scales itself: shadow map size, AO sample count, bloom mip count, particle
budget, volumetric step count. Tier 0 must hold 60 fps on integrated graphics;
tier 3 is what the screenshots are graded on.

## Coordinate conventions

Metres, seconds, radians. +Y is up, −Z is the level's "north". Eye height 1.62 m
standing, 1.05 m crouched. Player capsule radius 0.35 m. Gravity −22 m/s²
(deliberately not 9.81 — shooters lie about gravity to make jumps feel crisp).

## Testing

- `tests/blacksite.test.mjs` — imports the pure modules into Node and drives the
  simulation: movement and collision, the firing state machine, ballistics
  falloff and penetration, AI transitions, the director. No browser.
- `tests/blacksite_render.test.mjs` — boots the real page in headless Chromium
  (SwiftShader), renders frames, and fails on any console error, shader compile
  warning, NaN in a transform, or a frame that comes back a flat colour. Skips
  cleanly with a printed notice when Playwright or its browser is unavailable,
  so `npm run check` still passes on a machine without them.

## Working rules

**File ownership.** Each subsystem has exactly one owner. Never edit a file you
do not own — if you need something changed in `main.js`, `core/state.js`,
`core/constants.js`, `core/input.js`, `render/engine.js`, `world/collision.js`
or `index.html`, say so in your report instead. Those six are integration
surface and are edited in one place only.

**Keep the exported signatures.** Every module here started as a stub with a
working signature that `main.js` already calls. Replace the *body*, keep the
*shape*. Adding new exports is fine; changing or removing an existing one breaks
the boot.

**No new runtime dependencies.** `three` and `three/addons/` resolve through the
importmap to `vendor/`. Nothing else. No CDN, no npm at runtime, no fetch of a
remote asset. Textures are generated procedurally at boot, not downloaded.

**Budget.** Boot must stay under ~2 s on a mid-range laptop, so anything
expensive is generated at low resolution and upscaled, cached, or built lazily
on first use. A 2048² procedural texture costs about 40 ms; four of them at boot
is fine, forty is not.

### Verifying your work

    node --check <file>                              # syntax
    node tests/blacksite.test.mjs                    # logic suite
    node tools/blacksite/shoot.mjs --out node_modules/.scratch/x.png \
         --pose overlook --w 800 --h 450 --frames 6  # renders + console check

The screenshot rig runs on SwiftShader — software rendering. A single 800×450
frame takes a few seconds and a 1600×900 one takes tens of seconds, so keep
resolutions small and frame counts low while iterating. It is a *look* check and
a *does-it-throw* check, never a performance measurement. Exit code is non-zero
if the page logged any error. Do not run `npm run check` — it writes `dist/`,
and several agents doing that at once corrupts the build.
