# Galaxy Pusher

Coin pusher x space battle, real 3D. Link: `https://games-71g.pages.dev/galaxy_pusher/`. Tests: `npm run test:galaxy` (core rules + physics in node, then real Chromium with software WebGL).

## Files
- `machine.js` the cabinet as rigid-body physics (Rapier, vendored `vendor/rapier.js`, WebAssembly, async `loadPhysics()`). Units are centimetres; x across, y up, z toward the player, the drop edge at `EDGE`.
- `core.js` the rules only (row of 6, triples, volleys, combo, points, enemies, wheel, items, saves). `Game(seed, machine)`.
- `view3d.js` three.js scene (vendored `vendor/three.module.min.js` via the importmap in `index.html`): instanced coins, cabinet, notched pusher, shooters, camera fit.
- `render.js` 2D overlay only (battle strip, wheel, sprites). `heroes.js` slim Rox/Jas fighters. `main.js` loop, input, effects. `audio.js` synth.

## Physics rules learned the hard way (do not undo without re-measuring)
- Rapier is pinned to 0.17.3 (`vendor/VERSIONS.txt`; measured: half the coin overlap of 0.21, a third the cost of 0.14). Coins are `roundCylinder` colliders, 2.8 mm thick. World: gravity 500 (half of real), 40 Hz, `numSolverIterations` 4, `contact_natural_frequency` 100, `numInternalPgsIterations` 4, `lengthUnit` 10, prediction 1 mm. Default soft contacts let thin coins sink half into each other; `lengthUnit` 100 makes Rapier reuse stale contacts for centimetres (coins hover past the edge or sink while sliding).
- `Machine.separate()` only puts a coin pressed into the floor back on top (lifting coin pairs apart caused ~250 pops a second: do not bring it back). Measured overlap in play: ~1.4 coin pairs at a time with a point more than 0.3 mm inside another, deepest ~1.8 mm. Coins more than 55% past the edge drop the floor from their collision filter (stale floor contacts made them hover).
- Towers are 300 / 400 / 600 / 900 / 1200 coins (wheel pockets). They stand and ride the carpet slowly (no random nudges); only when a tower's centre reaches the edge does it get a forward spin, swing its top into the front glass (`GLASS_Z`, a real collider in front of the drop gap), fire a `smack` event and burst. Coins past the edge with the floor filtered out get it back if they bounce off the glass over the field.
- A standing tower is one body (a stack of real coin bodies collapses on its own in Rapier and costs 10 to 36 ms a step: measured). When it goes over it crumbles: `burst()` turns it kinematic and sensor, `peelLayer()` turns its layers into real coins top first over ~0.45 s (every coin for small towers, fewer per layer with `mul` for big ones; `CRUMBLE_MAX`, `CRUMBLE_LIVE`). Expect a short physics spike while a big crumble drains.
- Impulses are mass scaled (grams times cm/s). Towers: one heavy cylinder body; rendered as rings of 8 coins edge to edge (no overlap), brick-offset layers. They wait, the pusher pulls back to `FACE_RET`, the tower rises out of the floor in the pusher's half-circle notch, then the notch shoves it forward. A spill is capped at `FIELD_CAP` loose coins; extra coins merge (`mul`).
- Budget: about 3.4 ms per frame for the game update on a desktop with ~190 coins, about 11 ms at 3x CPU throttle (measured in headless Chromium).

## Saves
`galaxy_pusher_v1` (never rename). Inner `v: 2` holds the machine snapshot; a `v: 1` save (old 2.5D machine) keeps progress and gets a fresh machine.
