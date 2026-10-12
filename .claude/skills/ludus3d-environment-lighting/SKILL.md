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
