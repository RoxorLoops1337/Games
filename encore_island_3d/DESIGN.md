# Encore Island 3D — art/engineering contract

Low-poly 3D test slice of Encore Island (the 2D game in ../encore_island). Three.js r170 is vendored in ./vendor (importmap in index.html:
`import * as THREE from 'three'`, addons via `three/addons/...`). No build step, no network, no textures from files — only procedural geometry
and canvas-drawn textures.

## Look
Candy-pastel faceted low-poly (think Alto's Odyssey × Monument Valley × Animal Crossing). `flatShading: true` MeshStandardMaterial, roughness
~0.8, saturated pastel palette from js/palette.js, soft warm key light + cool fill, long soft shadows, bloom on emissives, fog toward a
sky-blue horizon. Characters get a thin dark-ink silhouette (inverted-hull) so they match the 2D game's inked look. Jasmin = pink dress +
brown ponytail + microphone; RoxorLoops = dark tee, green trousers, spiky hair. Everything must read at phone size.

## Budget
Whole scene < 120k triangles, < 250 draw calls (merge static geometry, InstancedMesh for flora), 60fps on a mid phone. Shadow map 2048 max.

## Coordinates
Y up. 2D game coords map x→x, y→z at SCALE 0.02 (1 unit ≈ 50 2D px). Characters stand on y=0, face +Z, ~1.7 units tall (Jasmin) / 1.8 (Roxor).
Hub island radius ≈ 9.4 centred at (0,0). Land 1 meadow island centre (-12.7, 13.1) radius ≈ 6.2, joined to the hub by a boardwalk.

## Modules (each default-free, named exports)
- `js/characters.js`  → makeJasmin(), makeRoxor(), makeCreature(kind: 'kappa'|'oni'|'slime'), makeFan(seed)
  each returns `{ group, update(dt, t, st) , ...}`; st = { speed: 0..1 (walk speed fraction), singing: bool, carry: int, hurt: 0..1 }.
  Also: `attack()` (one-shot sing/swing), `die()` (returns true when finished), `setCarry(n)` (Roxor: backpack/stack of loot crates).
- `js/environment.js` → buildWorld(scene, renderer) → `{ update(dt,t,focus), isWalkable(x,z), spawnPoints, sunLight }`
  Owns lighting, sky, fog, water, islands, plaza floor, flora, boardwalk, ambient particles.
- `js/props.js`       → buildProps(scene) → `{ update(dt,t,focus), plates:[{id,x,z,r,setGlow(0..1)}], coins:[{mesh,x,z,taken}], addCoinBurst(x,z,n), stage:{x,z} }`
  Owns stage, marquee sign, sell stall, vault, monument, glowing plates, lamp posts, speaker towers, pickups.
- `js/main.js` (lead) → renderer, post-processing, camera, input, gameplay loop, HUD, test hooks (`window.__E3D`).

Hub furniture positions (2D px → use ×0.02): STAGE (0,40) · SELL (-255,-115) · VAULT (-255,45) · FORGE (245,-165) · MONUMENT (0,-315) ·
upgrade plates speed(-228,300) cap(-113,350) dmg(0,372) rate(113,350) hp(226,300) · gem plates magnet(-125,-290) crit(125,-290) coin(-250,168) ·
marquee sign behind stage at (0,-62).
