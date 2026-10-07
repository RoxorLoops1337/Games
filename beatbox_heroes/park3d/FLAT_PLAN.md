# Flat3D: low-poly 3D version of the Beatbox Heroes flat (home)

Same engine, kit and house style as the park (read PLAN.md, RESEARCH.md, PALETTE_AND_BUDGETS.md, kit.js, palette.js first).
`Park3D.init(canvas, { scene: 'flat' })` builds the flat instead of the park. Page: `beatbox_heroes/flat3d.html`. Bundle is shared (`park3d.bundle.js`).

## Story and look
Tay and roommate Foxy share a cramped but loved one-floor flat in Neon City. Hip hop and beatbox life: record crates, posters, a mic on the desk,
sneaker wall, plants, string lights, a rent notice on the fridge. Warm lamps and a window with the city outside (day, dusk, night all readable).
Style: golden-hour miniature diorama, faceted flat shading, vertex colours, hue-shifted shadows, soft AO baked in, props with a story and grime. Dollhouse cutaway:
the camera looks in from the south-east above, so the south and east walls are low (about 0.9 m) or cut away, the north and west walls are full height with the windows.
Budget: whole scene <= 100k triangles, <= 70 draw calls, merge and instance. Characters as in the park.

## Layout (metres, +z is toward the camera, origin = centre of the living room, flat about 15 x 11, x -7.5..7.5, z -5.5..5.5)
* Front door on the south wall at x=5.5 (entry mat, shoe rack, coat hooks). Short hallway.
* Living room west half: couch facing a TV and a record shelf (tapes and records), coffee table, rug, beanbag, speaker stack, string lights, sneaker wall.
* Kitchen north-east: counter, sink, hob, fridge with rent notice, small table with two stools, fruit bowl (wholefood vibes), plants.
* Bedroom south-west corner behind a half wall: bed, nightstand lamp, laundry pile, window.
* Wardrobe with full-length mirror on the west wall.
* Desk nook north: desk, PC with a livestream ring light and a mic arm, posters, window on the north wall.
* Vocal booth: a small padded booth (foam panels, mic, glowing OCCUPIED sign) at the north-east, next to the kitchen.
* Everything walkable has >= 0.9 m clearance. Colliders via `blocked(x,z)`.

## Spots (ids match the 2D game's SPOT_FOR in places.js: booth, couch, bed, desk, kitchen, wardrobe, door)
| id | label | anchor | cine clip |
|---|---|---|---|
| booth | TRAIN | boothSpot (in front of the booth) | beatbox |
| couch | TAPES | couchSpot | sit |
| bed | SLEEP | bedSpot | sit |
| desk | STREAM | deskSpot | talk |
| kitchen | EAT | kitchenSpot | cheer |
| wardrobe | STYLE | wardrobeSpot | wave |
| door | LEAVE | doorSpot | wave |
Foxy (NPC, `createNPC(ctx,'foxy')`) lounges on the couch or stands in the kitchen. Tap her to talk (event `npc` {id:'foxy'}).

## CONTRACT (the flat module implements the terrain contract so controls, spots, lighting keep working)
`buildFlat(ctx) -> {` everything from the park terrain contract `group, bounds, blocked(x,z), heightAt(x,z), pathDist(x,z), keepout(x,z,r), paths, update?, anchors` plus:
* `interior: true`
* `anchors`: `start {x,z,rot}`, `door`, `boothSpot`, `couchSpot`, `bedSpot`, `deskSpot`, `kitchenSpot`, `wardrobeSpot` (each `{x,z,rot}`, rot = facing yaw the player takes), plus `foxy {x,z,rot,seatY?}`.
* `spotDefs`: `[{ id, anchor, label, color, color2, cine:{snap,face,clip,zoom,exact?}, icon }]` (spots.js uses these instead of its park list when present). `icon` is one of the glyph ids spots.js draws.
* `camera`: `{ dist:11, pitch:50, yaw:35, fov:34, minDist:7, maxDist:15, focusY:0.8 }` overrides for controls.js (defaults stay park values when absent).
* `lights`: `[{ x,y,z, color:'#ffcf8a', r:7, i:1.0, flicker?:0..1, kind:'lamp'|'tv'|'fridge'|'neon' }]` practical lights. Lighting turns them into point lights (max 3 real ones, nearest to the player) and additive glow sprites (all).
* `windows`: `[{ x,y,z, w,h, nx,nz }]` (centre of the opening, size, outward normal). Lighting shines day, dusk or night light in from each and tints the pane.
* `emissive`: meshes whose `material.userData.nightGlow` is set glow at night like in the park.
* `outside`: optional group (city skyline seen through windows). Flora's skyline builder is reusable: `buildSkyline(ctx, {ring, ...})` if the interior artist wants it, else draw simple blocks.
`bounds {minX,maxX,minZ,maxZ}` is the walkable area.

## Ownership (one owner per file, nobody edits another owner's files)
| role | files |
|---|---|
| Interior Artist (shell, rooms, furniture, props) | `flat.js`, `flat_*.js` |
| Lighting and VFX Artist | `lighting.js`, `fx_vfx.js`, `fx_post.js` (add an interior mode when `terrain.interior`) |
| Gameplay Engineer | `spots.js`, `controls.js`, `ui3d.js`, `main.js`, `char_npc.js` (Foxy), `beatbox_heroes/flat3d.html`, test |
No em dashes anywhere. Use `node tools/beatbox_heroes/shot3d.mjs` (new `--scene flat` flag added by the Gameplay Engineer) to render. Save progress shots to scratchpad `lowpoly/progress/flat_*.png`.
