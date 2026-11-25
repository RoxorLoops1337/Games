# Galaxy Pusher

Coin pusher x space battle, real 3D. Link: `https://games-71g.pages.dev/galaxy_pusher/`. Tests: `npm run test:galaxy` (core rules + physics in node, then real Chromium with software WebGL).

## Files
- `machine.js` the cabinet as rigid-body physics (Rapier, vendored `vendor/rapier.js`, WebAssembly, async `loadPhysics()`). Units are centimetres; x across, y up, z toward the player, the drop edge at `EDGE`.
- `core.js` the rules only (row of 6, triples, volleys, combo, points, enemies, wheel, items, saves). `Game(seed, machine)`.
- `view3d.js` three.js scene (vendored `vendor/three.module.min.js` via the importmap in `index.html`): instanced coins, cabinet, notched pusher, shooters, camera fit.
- `render.js` 2D overlay only (battle strip, wheel, sprites). `heroes.js` slim Rox/Jas fighters. `main.js` loop, input, effects. `audio.js` synth.

## Physics rules learned the hard way (do not undo without re-measuring)
- Coins are `roundCylinder` colliders, 2.8 mm thick. World: gravity 500 (half of real), 40 Hz, `numSolverIterations` 4, `contact_natural_frequency` 100, `numInternalPgsIterations` 4, `lengthUnit` 10, prediction 1 mm, contact skin 0.1 mm. Default soft contacts let thin coins sink half into each other; `lengthUnit` 100 makes Rapier reuse stale contacts for centimetres (coins hover past the edge or sink while sliding).
- `Machine.separate()` runs after every step: flat coins sharing space are lifted apart, a coin pressed into the floor goes back on top. Coins more than 55% past the edge drop the floor from their collision filter (stale floor contacts made them hover).
- Impulses are mass scaled (grams times cm/s). Towers: one heavy cylinder body; rendered as rings of 8 coins edge to edge (no overlap), brick-offset layers. They wait, the pusher pulls back to `FACE_RET`, the tower rises out of the floor in the pusher's half-circle notch, then the notch shoves it forward. A spill is capped at `FIELD_CAP` loose coins; extra coins merge (`mul`).
- Budget: about 3 ms per frame for physics on a desktop with ~200 coins (about 7 ms at 3x CPU throttle).

## Saves
`galaxy_pusher_v1` (never rename). Inner `v: 2` holds the machine snapshot; a `v: 1` save (old 2.5D machine) keeps progress and gets a fresh machine.
