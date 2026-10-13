---
name: ludus3d-environment-lighting
description: Ludus Maximus 3D only. How to build the golden-hour Roman environment (colosseum bowl with 3700 GPU-animated spectators, walled hillside ludus with city and Colosseum skyline, sky dome with time of day, torches, banners, velarium, dust, god rays) plus the bloom/grade post chain, quality tiers and dynamic resolution, for js/env_arena.js, js/env_ludus.js and js/post.js. Tested reference modules and lab pages live in ludus_maximus_3d/lab/.
---

# Ludus 3D environment, lighting and post

Research note: the network was blocked while writing this, so values come from tested reference code (screenshots reviewed) plus prior knowledge of three.js r170 practice, not from fresh web reading.

## Files (all in `ludus_maximus_3d/lab/ref/`, copy to `js/` and fix import paths; they import `three` and `three/addons/...` via the importmap)

| ref file | purpose |
| --- | --- |
| `envtex_ref.js` | seeded tileable canvas textures: `makeSandTexture`, `makeStoneTexture`, `makeMarbleTexture`, `makeGroundDetail`, `makeClothTexture`, `makeRoofTexture`, `makeCourtyardFloor`, `makeColosseumFacade`, `makeRadialTexture`. Each returns `{map,bump}` (bump = grayscale canvas for `bumpMap`). 512px ~40ms, 1024 ~150ms. |
| `sky_ref.js` | `createSky()`, `TOD` presets (dawn, golden, dusk, night), `lerpTOD`, `todFromHour(h)`, `createLightRig(scene,{shadowSize,shadowRadius,shadowCenter})`, `applyTOD(preset,{rig,scene,sky,renderer,nightUniforms})` |
| `envfx_ref.js` | `patchMaterial` (onBeforeCompile injector), `prepGeo/mergeGeos/colorize/boxGeo` (baked AO + merge helpers), `createFlames`, `createDustMotes`, `createGodRays`, `createBlobShadows`, `createWater`. NOTE: named envfx because `fx_ref.js` belongs to the combat VFX module. |
| `env_arena_ref.js` | `createArena(opts)` colosseum bowl |
| `env_ludus_ref.js` | `createLudus(opts)` hub terrain, walls, trees, city; `terrainHeight(x,z)`, `COURT` |
| `post_ref.js` | `createPost`, `TIERS`, `detectTier`, `createDynamicRes`, `GradeShader` |
| `env_lab_boot.js`, `../env_arena_ref.html`, `../env_ludus_ref.html` | lab harness; query params `?cam=0..6&tod=golden|dawn|dusk|night&tier=high|medium|low&hype=&wave=&gate=&az=&el=` |

Screenshot: `python3 -m http.server <port> --directory /home/user/Games &` then `node tools/3d_shot.mjs "http://127.0.0.1:<port>/ludus_maximus_3d/lab/env_arena_ref.html?cam=0" out.png --w 1000 --h 700`. Use `--eval "__post.pulseCA(0.03)"` to test post uniforms. A first frame takes ~20 s on software GL.

## Renderer setup (exact)

```js
renderer = new THREE.WebGLRenderer({antialias:false, powerPreference:'high-performance'}); // MSAA lives in the composer RT
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9; // set by applyTOD
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true; // portcullis clip plane
```
Never set `outputColorSpace` away from sRGB. Materials render linear HDR into a HalfFloat RT, `OutputPass` does tone map + sRGB. Custom ShaderMaterials end with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` (no-ops inside the composer, correct without it).

## Lighting values that worked

One `DirectionalLight` shadow caster + `HemisphereLight`, `FogExp2`. No other lights (torch glow is additive sprites).

| preset | sun elev/az | sun color / int | hemi sky / ground / int | fog / density | exposure |
| --- | --- | --- | --- | --- | --- |
| golden | 16 / 232 | 0xffb25e / 3.5 | 0xa4a2cc / 0xc98650 / 1.35 | 0xeab68a / 0.0024 | 0.9 |
| dawn | 9 / 105 | 0xffc8a0 / 2.6 | 0x9fb2e0 / 0xc88a6c / 0.95 | 0xf0c9b4 / 0.0032 | 0.95 |
| dusk | 3 / 250 | 0xff7a3d / 2.3 | 0x5d6ab0 / 0x8a4a3c / 0.8 | 0xb86e72 / 0.0034 | 1.0 |
| night (moon) | 38 / 120 | 0x8fa8ff / 0.85 | 0x2c3f7c / 0x3a2e4c / 1.05 | 0x0f1636 / 0.0032 | 1.15 |

- Arena: override golden to `sunElev 33, sunAz 215`. At 16 degrees the 18 m facade shadows the entire sand floor. At 33 degrees the far half is lit and the near half is in a crisp facade+velarium shadow, which reads as drama. Ludus keeps 16 degrees with `sunAz ~332` so the sun disc sits at the left of frame for the hero view.
- Shadow: `mapSize` 2048 desktop / 1024 mobile, ortho half size 50 (arena) / 48 (ludus), `bias -0.0004`, `normalBias 0.04`, `radius 2.5`. Only stone, velarium, trees, torches, bronze cast. Crowd, sand, banners do not cast (cost) but crowd and sand receive.
- Hemisphere sky must be lavender not blue (0xa4a2cc). Blue makes the courtyard flagstones read cold. Shadows lean violet through hemi plus the grade split tone.
- Sunlit albedo must stay under 1.0 linear so only flames, sun disc and glints (HDR > 1.02) bloom. Directional intensity 3.5 on albedo 0.85 gives about 0.9.

## Sky dome (`createSky`)

Sphere radius `camera.far*0.5` following the camera, `gl_Position = p.xyww` (pinned at far plane), `depthWrite:false`, `fog:false`, `renderOrder -10`. Gradient horizon, mid, top by `e = dir.y` (mid band -0.02..0.28, top 0.16..0.95), halo `pow(sd,5)*0.28 + pow(sd,40)*0.55` tinted by `uGlow` and boosted near the horizon, sun disc `smoothstep` at `cos(0.03)` with HDR intensity 10 (moon 3), 5-octave fbm clouds projected on a plane (`d.xz/(e+0.18)`, lit by sampling fbm shifted toward the sun for fake self-shadow, silver lining `pow(sd,6)`), stars via 3D cell hash at night, 1/255 dither against banding. `applyTOD` drives everything. `update(camera,t)` each frame.

## Arena API (`createArena({crowd:3700, density:1, decalRes:2048})`)

`arena.group`, `update(t,dt)`, `setHype(0..1)`, `setWave(0..1)`, `setGate(open01, side?)`, `setNight(0..1)`, `setDensity(0..1)`, `stampFootprint(x,z,heading,scale,side)`, `scuff(x0,z0,x1,z1,width)`, `footTrail(x0,z0,x1,z1,step,scale)`, `ring(d,theta)`, `normalAt(d,theta)`, `uniforms {uTime,uHype,uWave,uWaveSpeed,uWaveK,uWind}`, `DIM {SA:22, SB:14.5, PH:3, FD:17.5, FH:18}`, `shadowHint`, `crowdMesh`, `flames`.
- Sand ellipse semi-axes 22 x 14.5, world x is the long axis, gates at x = +-22 (portcullis lifts with `setGate`). Sand decal canvas pixel (px,pz) = world `((x+SA)*ppm, (z+SB)*ppm)`; it is uploaded once per frame only if dirty. Pre-raked concentric rings are painted at boot.
- Geometry: ONE merged stone mesh (`sweep()` profile swept around the ellipse with analytic normals, baked AO vertex colors, per-quad skip for the gates) covers podium wall, 15 seat rows, praecinctio walkway, promenade, gallery wall, 3 facade tiers, cornices, parapet. Instanced: arch voids, archivolt rings, half columns, attic windows, niches, niche bars, bronze shields, torches, braziers, masts, banners. Two gates, velarium (30 sails), crowd.
- Crowd: ONE `InstancedMesh` of 3700 spectators (60 tris each: 6-sided torso, icosa head, two open arm prisms), `aPart` per vertex, `aRand` vec4 per instance (phase, skin, hair/sleeve, hop), `setColorAt` cloth color (patricians white/purple in the lower 4 rows). All motion is in the vertex shader via `patchMaterial` on a `MeshLambertMaterial`: idle sway, stadium wave `sin(atan(z*SA/SB,x)*uWaveK - t*uWaveSpeed)` with `smoothstep(0.3,0.95)` (stand up stretch + arms), cheer hop `uHype*max(0,sin(t*(6..9.5)+phase))`, arms rotated about the shoulder pivot `(+-0.25,0.68)` by `raise*(2.55+0.45 sin)` with `raise = clamp(uHype*1.6 - rand*0.9 + pulse*1.3)`. Instances are shuffled before writing so `mesh.count = floor(total*density)` thins uniformly. Skin and hair are recolored in the fragment shader (`fBody` hook). Zero CPU per frame.
- Velarium: ring of 30 sails (cream/terracotta by parity, sag per sail, `aSway` billow in vertex shader), `emissive 0x6a3a1a * 0.55` fakes sun translucency, casts shadow.
- Night: `setNight` makes arch voids glow warm (HDR color on the basic material) and lowers velarium emissive. At night the crowd is nearly black; for night fights add two or three warm `PointLight`s (no shadow) over the sand, budget permitting.

## Ludus API (`createLudus({density})`)

`ludus.group`, `update(t,dt)`, `setNight`, `setSun(sunDir,color)` (water glint), `setDensity`, `groundHeightAt(x,z)` (= `terrainHeight`), `COURT {hw:24, hd:19}`, `pathX(z)` road centerline, `dust`, `flames`, `water`.
- +z is downhill to the city (front gate at z=+19, gap 6.8 m), -z is the hill and portico. Courtyard floor y=0 (plane at 0.01, terrain -0.06 inside the 5 m margin).
- Terrain: 150x150 grid with quadratic spacing (`x = sign(u)*u^2*460`, ~0.6 m near the center, 12 m at the rim), `terrainHeight` = plateau + side slopes + terrace quantize + fbm hills + back mountains + valley floor at y -36 with smooth max + far rim. Vertex color from slope, noise patches, valley field bands, road, plus `makeGroundDetail` multiplied on top. 90k tris.
- Walls/towers/buttresses/gate/caps are `boxGeo` + `colorize` merges (world-scale UVs so the stone texture never stretches). Roofs use `makeRoofTexture`. Portico: 11 marble columns instanced. Pool: 4 rim slabs + basin + `createWater`.
- Trees (3 InstancedMeshes + bushes + blob shadows): cypress (lathe, 8 sides, jittered), olive (twisted trunks + 5 squashed jittered icospheres), stone pine (umbrella canopy). Baked vertex-color AO (dark underside to light top). Sway via `patchMaterial`: `w = (y/H)^2 * A * uWind` (cypress H 9 A 0.28, olive 4.2/0.12, pine 9/0.18). Do not use `(y*k)^2` unnormalised (it bent trees 10 m).
- City: 780 houses (box + flat pyramid roof, instanceColor tint), window quads that glow at night, 70-bay aqueduct (extruded arch bay), temple (drum, dome, portico), forum columns, Colosseum landmark (elliptical strip with a canvas arcade texture, ruined cut, inner dark cone), birds flapping in a vertex shader. Distance haze is just `FogExp2`.

## FX recipes (envfx_ref)

- Torch flame: instanced billboard (`instanceMatrix` center in view space), fbm teardrop shape, color ramp to HDR (4.2,3.2,1.7) core so bloom picks it up, additive, `depthWrite:false`, `renderOrder 5`; plus a radial glow halo quad. 2 draw calls for any number of torches. Halo alpha `0.14 + 0.26*night`, halo scale 3.2 to 3.4 x flame height (5x blew out at night).
- Dust motes: `Points`, motion = `position + wind*t + sin offsets`, wrapped with `mod` inside a box, in the vertex shader; set `uPR` to renderer pixel ratio. 300 to 420 motes.
- God rays: crossed quads along the sun direction, `edge * along * stripes`, fade near camera. 16 shafts width 4 to 7 m, length 26, intensity 0.085 (0.14 looked like lasers).
- Blob shadows: instanced radial decals with `polygonOffset`, color 0x1a1230, opacity 0.4 to 0.55.
- Heat haze lives in the grade pass (`uHeat`, band `uHeatBand`).
- `patchMaterial(mat,{key,uniforms,vPars,vBody,fPars,fBody,vAfterUv})` hooks: `vBody` runs after `begin_vertex` (edit `transformed`), `fBody` after `color_fragment` (edit `diffuseColor`), `vAfterUv` can remap `vMapUv` (banner atlas: `vMapUv.x = (vMapUv.x + aVar)/3.0`). Always give a unique `key`. Use `instanceMatrix[3].xyz` for per-instance world-ish phase.

## Post chain (`createPost(renderer,scene,camera,{tier})`)

`RenderPass -> UnrealBloomPass(strength 0.55, radius 0.65, threshold 1.02) -> GradePass -> OutputPass`. RT is `HalfFloatType` with `samples` per tier.
- API: `post.render(dt,t)` instead of `renderer.render`, `post.setSize(cssW,cssH)` (on resize and after scale change), `post.setTier('high'|'medium'|'low')`, `post.pulseCA(0.012)` on heavy hits (decays `exp(-9dt)`; a permanent 0.0008 whisper remains), `post.zoomPunch(0.05,cx,cy)` radial 8-tap zoom blur (decays `exp(-7dt)`), `post.uniforms.uHeat/uVignette/uGrain/uSat/uContrast/uSplit`.
- Grade defaults: vignette 0.42, grain 0.028 (multiplicative, safe in HDR), shadow tint (0.95,0.93,1.06), highlight tint (1.12,1.03,0.88), lift (0.012,0.008,0.02) so blacks are violet not black, saturation 1.08, contrast 1.04 around 0.18. Grade runs BEFORE OutputPass, so it works in linear HDR (grain and split tone are multiplicative for that reason).
- Tiers (`TIERS`): high = dpr cap 2, MSAA 4, bloom 1.0 at half res, shadow 2048, crowd 1.0; medium = dpr 1.5, no MSAA, bloom 0.8 at 0.35 res, shadow 1024, crowd 0.8; low = dpr 1, bloom pass disabled, no grain/CA, shadow 1024, crowd 0.55. Environment modules take `density` from `TIERS[tier].crowd`; call `rig.setShadowSize(TIERS[tier].shadow)`. `detectTier()` returns medium on phones.
- `createDynamicRes(post,{target:1000/55,min:0.55,onTierDemote})`: call `tick(frameMs)` each frame. EMA of frame time; 20 slow frames (>1.25x target) drop the pixel-ratio scale by 0.1 (cooldown 20 frames); 120 fast frames (<0.8x) raise it by 0.1; at min scale and still slow it calls `onTierDemote` to step the tier down. It applies via `post.setSize`.

## Measured numbers (software GL, scene incl. shadow pass; `renderer.info.autoReset=false`, reset per frame)

| scene / tier | draw calls | triangles | geometries | textures |
| --- | --- | --- | --- | --- |
| arena high | 37 (+15 post) | 330k | 26 | 22 |
| arena medium | 37 | 290k | 26 | 22 |
| arena low | 37 (post 2) | 240k | 26 | 11 |
| ludus high | 42 (+15 post) | 354k | 31 | 25 |
| ludus medium | 42 | 292k | 31 | 25 |
| ludus low | 42 | 218k | 31 | 14 |

Calls are far under 150, so triangles are the real mobile limit: the 300k mobile budget leaves little for fighters (budget about 60k) in medium. Use `setDensity` and a lower crowd count (2500) on phones, or drop head and arm parts on the low tier. Crowd is 60 tris per spectator; archivolt extrudes need `curveSegments: 4` (10 cost 100k tris).

## Pitfalls (all hit during development)

1. Vertex colors are LINEAR. A "dark" 0.10 to 0.3 grey renders as light lilac after tone mapping. Dark voids need 0.01 to 0.05. Convert hex with `new THREE.Color(hex)` then read `.r,.g,.b` (the `lin()` helper).
2. `colorize()` and `prepGeo()` return a NEW geometry when the input is indexed. Always use the return value or colors silently vanish.
3. `#include <...>` inside a GLSL string must start its own line, never after `;` on the same line (shader error "invalid character").
4. All merged geometries need identical attributes (position, normal, uv, color): use `prepGeo`.
5. A solid box as a pool rim hides the water plane (z-fight). Build hollow rims from 4 slabs.
6. Camera inside the seating shows a giant spectator. Keep cameras inside the sand ellipse `(x/22)^2+(z/14.5)^2 < 1` or above the bowl; the velarium blocks views from y 15 to 21 inside the facade.
7. Portcullis clip plane needs `renderer.localClippingEnabled = true`.
8. Naming: `fx_ref.js` is the combat VFX module of another teammate; this skill's helpers are `envfx_ref.js` and `envtex_ref.js`.
9. Reversed `smoothstep(e0,e1,x)` with e0 > e1 is technically undefined in GLSL; it worked everywhere tested, but prefer `1.0 - smoothstep(e1,e0,x)` in new code.
10. `InstancedMesh.frustumCulled` must be false for instanced FX that move in the shader (flames, birds, trees with sway, crowd); bounding sphere is the base geometry only.
11. Changing MSAA samples on the composer needs `renderTarget.dispose()` (done in `setTier`).
12. Sun elevation below about 25 degrees puts the whole arena floor in shadow (see Lighting). Keep arena golden at 33 degrees.

## Fight polish pass (sand, grade)
- Sand reads orange when the albedo (#d9b27c) is multiplied by an orange sun (#ffb25e) and orange hemi ground, then ACES. Fix both ends: sand texture palette E6CFA2/CDAE7E/F6E6C4 (ripple highlight weight 0.16, bump ripple 0.07, material bumpScale 2.0), TOD.golden sunColor 0xffc489 and hemiGround 0xb99872. Grade uSat 0.98, uContrast 1.12 (was 1.08/1.04).
- Trampled wear is painted in the arena decal canvas: ~90 soft elliptical blotches (alpha 0.07..0.17, dense near centre via pow(rnd,1.6)), not a single radial gradient, which reads as a dirty stain.
- Concentric raked rings in the decal must stay at alpha <= 0.10 or the floor looks like a vinyl record.

## Arena themes (js/env_arena.js THEMES, pickTheme, setTheme)

The bowl is built once; a theme is applied per fight at runtime (no rebuild). `THEMES` is a data table: `stone` (texture kind wood | stone | marble | sandstone | snowstone | basalt, plus tint), `sand` (floor texture kind sand | snow | ash, tint, `decal` style for the raked base layer: rake | ruts | cracks | snow | ash | medallion), `crowd` (density multiplier, visible seat rows, pleb and patrician palettes, patrician ratio low rows / high rows), `velarium`, `banners` (tint, count kept out of 56), `gold` (bronze trim colour), `torch` (minimum flame glow 0..1), `dress` (lazily built groups: palisade, hay, imperial, obelisks, snowdrifts, snowfall, embers), `horizon` (merged unlit silhouette ring: hills, peaks, dunes, city, volcano; visible from high shots), `base` + `sky` (TOD preset name plus overrides), optional `night` (`lights` adds three warm PointLights on non-lite tiers, `exposure`, `sunScale`).

| id | where | look |
| --- | --- | --- |
| sandpit | league 0, bounty hunts | timber stands, palisade, hay bales, 55% crowd on 8 rows, plain daytime sky, green hills |
| capua | league 1, small tournaments | the classic travertine golden hour |
| colosseum | league 3, Grand Games, tournaments from league 2 | marble, gold trim, imperial box (two instanced pulvinar), patrician crowd; night variant (weather night, or Imperial Games in even seasons) adds torch PointLights and a lower moon |
| desert | dust weather, Horde Trial, league 2 every third season | sandstone, cracked floor, obelisks at the gates, thin robed crowd, orange haze |
| gaul | rain weather from league 1, league 2 every third season | snow floor and stands, drifts, falling snow motes, furs, mountain ring |
| etna | Pit of Trials, festivals of Mars and Bacchus | basalt, ash floor with glowing fissures (emissive decal), ember motes, red sky, volcano with lava streaks |

- Selection: `pickTheme({weather, league, season, kind, festival, theme})`. `kind` and `festival` come from `F.meta` (fightsetup.js adds them). `meta.theme` forces one (lab, screenshots). The hook is two tagged `ARENA_THEME` lines in fightview.js (import + one line after `applyWeather` in `start()`); `setTheme(id, {rig, scene, sky, renderer, wx, night})` also re-applies the sky preset, with the weather overlays (rain, dust, heat) re-implemented in `weatherSky` so the theme sky survives them. Night weather always uses TOD.night.
- Cost: no new draw call except the visible dressing (at most 2 groups), the horizon (1) and PointLights (non-lite only; first night fight compiles new Lambert/Standard programs once). Textures are generated lazily per theme (512px stone ~40 ms, 256px ground ~50 ms) and cached. Crowd rows are hidden by collapsing instance matrices (originals kept in `M0`), outfits by `setColorAt`.
- Pitfalls: `Float32Array.filter/map` returns a typed array (wrap `arcThetas().thetas` in `Array.from` before `.map` to matrices); `fightview` passes `lite` (tier != high) to `createArena`, so test night lights with `tier=high`; FogExp2 swallows far silhouettes, so horizon materials are `fog:false` with baked vertex colours; changing `decalMat.emissiveMap` once recompiles; a camera inside the volcano distance (300 m) never happens, keep silhouettes beyond 240 m.
- Screenshots: `?demo=1&tier=low&manual=1`, then `--eval` that builds `makeDemoFight()`, sets `F.meta = {weather, theme, league, season, kind}`, calls `game.setScene('fight'); fightView.start(F,{noSplash:true})` and overrides the camera by wrapping `post.render` (overview `position (0,32,30) lookAt (0,3,-4)`, horizon `position (0,26,36) lookAt (0,10,-30)`).


## Round 3 (rig team): readable fighters, grade shoulder, crowd with faces
- **Why fighters were pink-white.** The sim hands out six skin hexes, two nearly white; the golden key (sun 3.5 plus hemi 1.25) clips a 0.9 albedo, and three additive terms in the character shader (sky fill, fresnel rim, sweat and blood "env" reflection of a lilac sky) pushed every lit surface toward the same pink-lilac. Fixes live in three places: `gradeSkin` in `js/gladiator.js` (lower albedo, olive-leaning Mediterranean / Gaulish / Thracian / North African range, per fighter variation), the `SHADE` table in `js/rig.js` (rim 0.55 to 0.24 with a pale neutral colour, subsurface 0.14 to 0.045, wrap tint toward brown, sweat gloss 0.14 to 0.24 roughness, blood reflection only at grazing angles), and the grade pass.
- **Grade pass (`js/post.js` GradeShader).** `uHighTint` is now 1.08 / 1.02 / 0.92 (was 1.12 / 1.03 / 0.88), saturation holds in the mids and highlights (`uSat + 0.1 * smoothstep(0.35, 1.2, l)`) so lit skin and cloth keep their hue, and a soft shoulder compresses luminance above 1.0 before ACES (`ov / (1 + 0.4 ov)`). The sun disc and god rays still bloom: bloom runs before the grade and ACES does the final roll-off.
- **Team colours.** `createGladiator(u, {team: 'A'|'B'})` (fightview passes `u.side`): tunic hue is kept when it already sits inside the team band (A 150 to 262 deg teal / blue / indigo, B 335 to 372 deg rose / crimson), otherwise rotated into it keeping lightness and saturation (min 0.5, lightness 0.3 to 0.5). Sand is hue 20 to 50, so orange and saffron tunics are always rotated. Plume = team accent (A `#2f86e8`, B `#d02a3e`). Portraits and the hub pass no team, so the player's own tunic colour survives there. `getHSL` / `setHSL` must be called with `THREE.SRGBColorSpace`: in the linear working space an orange tunic reads as hue 12 and passes the band test.
- **Readability test.** `node tools/ludus3d_readability.mjs [--tier high] [--w 1100 --h 650] [--shots prefix]` renders the fight five times with the camera frozen (all, team A, team B, nobody), diffs for exact fighter masks and measures delta E against the background behind them, clipped / washed share, accent hue of each team (hues outside the skin and sand band 5 to 55 deg), team hue separation, distance to the sand hue and the number of distinct hue sectors. Exit 1 on failure; thresholds in `LIMITS` at the top of the file.
- **Crowd (`createArena`, one InstancedMesh, still 1 draw call).** Hi tier 77 tris per spectator (torso 18 without a bottom cap, icosa head 20, 3-gon two-segment arms 12 each, 5 x 2 headwear dome 15), lite (medium and low) unchanged at 40 tris with the same shader (a painted hair cap instead of the dome). Per instance `aRand` (beat, skin, arm threshold, speed) and new `aRand2` (x headwear: hair 0..0.40, laurel 0.40..0.52, cap 0.52..0.70, hood 0.70..0.84, bald above; y hair colour or hat material; z outfit: tunic with belt and short sleeves below 0.5, draped toga with folds 0.5..0.85, hooded cloak above; w = flag + random: 0 fan, 1 standing, 2 senator). Standing fans (9 percent of rows 0 to 4, 1.8 percent elsewhere) stretch the torso into an open tube with bare shins and lift head and arms. Arms: idle on the lap, clapping forearms (half of the fans), one arm waving or both arms cheering as `uHype` and the wave grow, with an elbow bend; every spectator's hop and arm height follow excitement with zero CPU.
- **Senators.** 14 featured instances (7 per imperial box, indices 0..F-1, always inside `crowdMesh.count`), ivory toga with a purple stripe, wreath or bald, grey and brown hair. They collapse unless the theme's `dress` contains `imperial`; the crowd seats that fall inside a box footprint are hidden with it (`inBox`). `dressCrowd(c, seed, dress)` skips featured instances when recolouring.
- **Budgets measured (3v3, 1100x650, high):** calls 151, tris 285k before and about 340k after (crowd +14 tris each). Phones sit on low or medium, which are unchanged.
- Pitfalls: `aRand` must stay vec4 (`mergeGeos` plus instanced attributes), keep the `rnd()` call order of the seat loop (later arena parts draw from the same stream), use a separate generator (`rc`) for new per instance attributes. The arm bend rotates the lower ring about the elbow at y 0.51 (the middle ring stays); lite arms have only two rings so the whole arm tilts, which is fine at that size.

## Hub night and heat haze (hub team, wave 4)
- Grade pass: `uToe` (0 default, only the hub raises it at night) floors the contrast curve at 0.8 of the input colour. Without it dark foliage and terrain clip to pure saturated green/yellow because `(c - 0.18) * 1.12 + 0.18` is negative per channel. Any new dark-scene use of the grade pass (night fights) can reuse it.
- `uHeat` is a uv offset in x (about 1 to 2 pixels divided by the viewport width, never above 0.006). The shader masks it to `uHeatBand` (a strip around the projected horizon, set every frame by the hub), uses noise that is wide in x and fine in y so it ripples horizontally, and `uHeatAsp` (w/h) keeps it isotropic. Off on low tier and with reduced motion.
- The hub night preset (`NIGHT` in hub.js) deliberately differs from `TOD.night`: stronger cool hemisphere fill (2.15), moon 2.3, exposure 1.32, fog 0x1d2a5c. sky.js is untouched so the arena night keeps its own look. See ludus3d-hub, Wave 4.
