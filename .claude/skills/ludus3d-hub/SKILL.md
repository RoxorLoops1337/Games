---
name: ludus3d-hub
description: Ludus Maximus 3D only. The management-side 3D world (js/hub.js + js/buildings.js): terraced hillside ludus with 12 authored procedural buildings at 5 levels, orbit/tap camera, ambient gladiator life, weather and time of day. API, layout, budgets, lab usage and pitfalls for integrating or extending the hub.
---

# Hub (management world) for Ludus Maximus 3D

Files: `js/buildings.js` (buildings), `js/hub.js` (world, camera, life), `lab/hub_lab.html` (lab + gallery). Everything is procedural (no image/model files), three.js r170 from the importmap. The hub imports `env_ludus.js` (terrain, city, Colosseum, birds, dust), `sky.js`, `envfx.js`, `envtex.js`, `gladiator.js`, `rig.js`; it does NOT edit them.

## Integration (main.js)
```js
import { createHub } from './hub.js';
const hub = createHub({ renderer, camera, audio, tier, post });   // post is optional (heat haze uses post.uniforms.uHeat)
post.setScene(hub.scene);                 // composer RenderPass scene
hub.enter(S);                             // S = LM.newGame() shape; attaches pointer events to renderer.domElement, builds the world
hub.on('pick', (r) => { /* r = {type:'plot',i,empty,locked} | {type:'glad',id} | null */ });
frame:  hub.update(dt, clock);            // moves the camera, sky, fx, characters. then post.render(dt, clock)
resize: hub.resize(innerWidth, innerHeight);
state change (build, upgrade, week end, glad added/removed/act changed): hub.refresh(S);   // cheap no-op when nothing changed (~0.2 ms)
leave:  hub.exit();                       // removes listeners (scene keeps its state)
```
API: `scene, group, orbit` (live camera state `{az,pitch,dist,target,idleT,drift}`), `enter(S)`, `exit()`, `refresh(S)`, `update(realDt,t)`, `resize(w,h)`, `pick(clientX,clientY)`, `focusPlot(i,{dist,pitch,dur})`, `focusGlad(id)` (camera follows the walker until the user drags), `overview(instant?)`, `setSelection(sel)` / `setHover(sel)` (`{type:'plot',i}` or `{type:'glad',id}` or null), `getSelection()`, `on('pick'|'hover'|'select', fn)` (returns an unsubscribe), `hub.onPick` (plain callback alternative), `plotCenter(i)`, `groundAt(x,z)`, `setHour(h)`, `setWeather('clear'|'rain'|'dust'|'heat'|'night')` (overrides; omit to follow `LM.weather(S,'w'+S.week)`), `setTier(name)`, `actors` (Map id -> Actor with `.pos .rig`), `stats()`.
Time of day: `hour = 9 + ((S.week-1) % 12) * 0.8`, blended over 1.8 s when it changes. Night weather lights windows (per-plot glow uniforms) and torches.
Camera: one-finger/left drag orbit, right/middle/shift drag pan, wheel and two-finger pinch zoom (two-finger drag pans), tap picks (<9 px move, <450 ms), inertia, pitch 15..70 deg, dist 11..132, idle drift after 8 s. Canvas gets `touch-action:none`. Defaults frame the whole courtyard for the aspect ratio (portrait pulls back to ~120 m).

## World layout (read before touching coordinates)
- Courtyard 48 x 38 m (walls x=+-24, z=+-19). +z = front gate and the city/Colosseum (downhill); -z = hill. Plot i: row = i>>2 (row 0 is at the BACK, highest terrace), col = i&3. `LAYOUT = {PX:10.6, PZ:7.8, X0:-15.9, Z0:-12.8}`, `plotCenter(i)` returns the pad surface point. Terrace heights `terraceH(r) = 0.06 + 0.55*(3-r)`; pad top is +0.1.
- Land expansion (`S.rows`) goes DOWNHILL toward the gate: rows >= S.rows are overgrown land with for-sale posts, empty owned plots get a pulsing pad ring.
- Building fronts face -z (toward the hill) because the default camera sits on the hill side looking at the city (az = PI + 0.42). Building-local frame is +z = front; the hub rotates every building by PI. If you add per-building code in hub coordinates remember `world = (c.x - local.x, c.z - local.z)`.
- Footprint per building `{w:8, d:5.4}` (scout 4 x 4.4), pad 9 x 6.2, alleys 2.4 m.
- The back wall is low (1.7 m) so row 0 is never hidden; side/front walls 3.2 m.

## Buildings (`buildings.js`)
`createBuilding(id, level 1..5, {accent, ownFlames})` -> `{group, update(t,dt), setGlow(0..1), footprint:{w,d,h}, fx:{flames,smoke,sparks}, tris, calls}`. ids = `BUILDING_IDS` (the 12 `D.BUILD` keys: barracks palaestra kitchen bath infirmary forge market scout sparring stands shrine hall). `accent` = banner color (hub passes `D.COLORS[S.color]`).
- At most 6 meshes (masonry, roof, wood, metal, cloth, glow) + 2 flame instances when `ownFlames`. Level 5 triangles: 1.3k to 3.7k (budget 6k). All materials are shared singletons (`getLib()`); standalone buildings and the merged hub use the same ones.
- `buildParts(id, level, opts)` returns cached merged geometry per material plus emitters; the hub merges every plot into ONE mesh per material (6 draw calls for all buildings, a vertex attribute `aPlot` = plot+1 selects the per-plot uniform `uHL[]` (hover/select rim glow) and `uGl[]` (window glow)). Standalone meshes have no `aPlot` -> index 0.
- Authoring kit (`Kit`, exported): `box(mat,w,h,d,x,y,z,hex,{ry,rx,rz,c,ao})` (y = base unless `c:true`), `cyl cone sphere lathe tor poly sheet`, `gable hip shed col win door torch brazier barrel amphora crate bench table banner awning statue bed`, `at(x,y,z,ry,fn)` local frames, `flame/smoke/spark` emitters. Colors are sRGB hex or a linear `[r,g,b]` array (values > 1 allowed); vertex colors carry baked AO (height gradient, contact darkening). Glow parts: `mat 'glow'` with `{em:[flag, minGlow]}`: flag 1 = lit at night (windows), `minGlow` > 0 = always emissive (forge coals, braziers).
- Cloth sways in the vertex shader (`uv.x` = distance from the fixed edge; plants use `{sway}`), wind from `buildingUniforms.uWind` (the hub raises it in rain/dust).
- Adding a building: `DESIGN.myid = (k, lv) => { ...; return {h} }` in buildings.js (it appears in `BUILDING_IDS`), and add the id to D.BUILD. Add a gallery check: `lab/hub_lab.html?build=myid&level=all`.

## Hub contents
Own perimeter wall (towers, gate with open doors, torches), terrace slabs with steps and coping, per-plot pads, 1 merged leaf mesh (cypress, olive, grass, bushes; sway), sand terrace tops (vertex colors, overgrown when locked), synergy links (soft gold arcs from `LM.neighbors` and `D.BUILD[b].like`, subtle at rest, bright when either end is selected/hovered), selection/hover ring (rounded-rect SDF shader, also circles for gladiators), flames (2 draw calls for every torch), smoke and sparks (Points, GPU), rain (LineSegments), bunting on festival weeks, dust motes and birds from env_ludus. Ambient characters: up to 12 (high), 8 (medium), 5 (low), each baked into ONE SkinnedMesh (`bakeSkinned`: rig joints are the bones, vertex colors from the rig materials, cloak/skirt secondaries hidden), driven by `rig.update(dt)` only within 95 m of the camera. Behavior by `g.act`: str/skl drill at the dummies, agi jog, end/work walk, spar duel pairs (attack, block/hurt), wil/rest/spy stand (watch for spy), anchored at the palaestra / sparring ring / market / scout / barracks plot when built, else the front forecourt.

## Budgets (software GL, `lab/hub_lab.html`, fully upgraded `full=1`, 9 glads, scene only incl. shadow pass)
| tier | draw calls | triangles |
| --- | --- | --- |
| high desktop | 55 (+15 post) | 370k to 395k |
| medium (phone) | 54 | 316k |
Env terrain 90k + trees/city dominate triangles; `createLudus` density is 0.8 x tier crowd. Gladiators 2k tris each. CPU: `update` 1.9 ms (software), `refresh` with a rebuild 45 to 70 ms (merges all plots; call it on state change only, not per frame).

## Lab
`http://127.0.0.1:PORT/ludus_maximus_3d/lab/hub_lab.html` (serve the repo root). Params: `cam=0..7` presets (0 overview, 6 city vista, 7 front view), `az pitch dist tx ty tz` raw camera, `focus=i`, `gfocus=id`, `sel=plot:5|glad:2`, `hover=i`, `hour=`, `weather=`, `full=1` (all 12 buildings, `level=`), `rows=`, `glads=`, `tier=`, `nodrift=1`. Gallery: `?build=all&level=5` or `?build=barracks,kitchen&level=1,3,5` or `level=all`. In headless runs use `--eval "window.__step(2)"` to advance the sim before the shot. Run at most 2 screenshots in parallel (software GL times out and returns a blank frame).

## Pitfalls
1. `aPlot`/`uHL` live in the shared materials: any new mesh using `getLib()` materials without `aPlot` is fine (index 0), a geometry merged with others MUST have `aPlot` on all parts (`addPlotAttr`).
2. Merge needs identical attributes: build with the Kit (`prepGeo`), never mix indexed geometry in.
3. Vertex colors are linear; roof material is tinted (0.74,0.66,0.63) and shadows lifted with a small emissive that the hub fades at night (`lib.*.emissiveIntensity`). Do not set emissive on shared materials elsewhere.
4. A gladiator inside an open-court building still wins the tap (pick compares glad distance with the building box exit).
5. `orbit.touched` stops `resize()` from re-framing the overview; call `hub.overview(true)` to reset.
6. The sun is behind-left of the default camera (az 205..260, elevation 24..34) so facades are modelled by 3/4 light; weather presets blend `WEATHER[...]`.
7. `refresh` restarts nothing when the hour/weather key is unchanged; changing `S.week` blends the sky over 1.8 s.
8. Cloth does not cast shadows and uses DoubleSide; keep cloth sheets thin (3 x 4 grids).

## Visual polish and phone input pass (HUB-VISUAL)
- Roofs: `roofWeather` in buildings.js (shader on the shared roof material): desaturated terracotta, per-patch ochre/brown/grey tiles, weathering noise, rain streaks, moss on low shaded slopes. Warm base `LIB.roof.color (0.86,0.66,0.5)`. Distant city roofs are muted and varied in env_ludus.js.
- Rear yards: `rearYard(k,id,lv)` (buildings.js, called from `buildParts`, `opts.noRear` skips) puts laundry lines, woodpiles, stores, herb tubs, coal heaps, racks at the back edge of every pad (about 250 tris each).
- Gladiators: `bakeSkinned` now bakes the verlet secondaries (cloak, pteruges, plume; not nets) at rest shape rigid to the anchor bone, with an `aSway` attribute and a patched `SKIN_MAT` (DoubleSide) that flutters the hem in the vertex shader. No extra draw calls.
- Sparring: pairs are driven by member 0: 1 to 3 hit combos, lunge/recoil along the pair axis (`a.lg`), block or hurt with sfx, roles swap, 0.95 m half spacing.
- Light: god rays (`godrays`, one additive ribbon mesh, 6/10 shafts, strength from sun elevation, night and weather), lightning flashes in rain (not with reduced motion) with `audio.ambient.thunder`, wet stone (colour and roughness) in rain, flowering shrubs and lavender, swallows (env birds, roost at night), Colosseum facade texture with a ruined side facing the courtyard.
- Day cycle: `hourOf = 7 + (week-1)%12`, week 1 early morning, week 12 sunset; plus a live creep of up to +0.9 h over 6 minutes within a week (`liveOff`). `presetFor` now covers 0..24 h (moonlight after 20:30); `setHour(h)` overrides, `setHour(null)` returns to the week.
- Low tier budget trick: cypress/pine and `hub_metal` do not cast shadows on low (`trimCasters`), terrain seg 96. Measured in game (rich state, 7 extra plots, 12 glads, 390x800): low 47 calls / 178.5k tris, medium 69 / 253.7k, high 78 / 404.7k (1100x650).
- Phone taps: `pick(x,y,e)` with a touch event uses `pickSlop`: direct hit first, else nearest projected building box or gladiator within `clamp(0.09*min(w,h),30,64)` px. A touch tap on a building while `orbit.dist > 44` zooms to it (`focusPlot`), selects it and shows the DOM label card (`.lx-hubcard`, Open button); a second tap or the button emits `pick`. `preview` event fires for the first tap. Tapping empty ground while previewing returns to the overview. Desktop hover shows the same card without a button. `hub.focusHome()` (used by the nav Ludus tab) and `hub.closeCard()` exist. Tested with Playwright touch (tap 24 px off a 70 px building: zoom 122.9 to 35, card, second tap opens; CDP pinch 122.9 to 35.5 and back, drag orbit, two-finger pan).
- Audio feed: every 0.25 s `audio.ambient.update({hour, night, weather, rain, wind, zoom, focus:[{kind,w,pan}], glads, spar, drill, fest})`; ambient stops in `exit()`; `audio.attachUi(#ui,{hover:true})` on enter.

## Wave 3: keyboard camera
The canvas is focusable (`tabindex=0`, role application, class `lx-bl-focus` with a white outline plus a gold inset ring) while the hub is entered. Arrow keys and WASD pan on the ground relative to the camera, Q and E rotate, plus and minus (also = and _) zoom, Page Up and Down tilt, Home or 0 return to the overview, Escape leaves the canvas. Held keys feed `stepKeys(dt)` inside `stepOrbit` and call `touchedNow()` (cancels animations and idle drift), so mouse, touch and wheel are untouched. A pointer press focuses the canvas so keys work right after a click. A pill hint (`.lx-bl-hubhint`, aria-hidden) shows on focus and disappears on the first key; a visually hidden `role=status aria-live=polite` region announces zoom and rotation when keys are released. Any open modal captures arrow keys first (ui_kit `onModalKey`), by design. Hub actors are rebuilt when `markSig(g)` (scars plus wound parts) changes.
