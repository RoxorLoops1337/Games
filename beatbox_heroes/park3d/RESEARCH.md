# Low-Poly Golden-Hour Park: Style Bible and Tech Playbook

Project: stylised city park at golden hour, walkable chibi character, interaction spots for mini games, phones in portrait, three.js in the browser.

## 0. How to read this document (provenance, please read)

The studio network proxy blocked most article sites (threejs.org, discoverthreejs, Codrops, Medium, Creative Bloq, Game Developer, Wikipedia, 80.lv, itch devlogs, and others). What I could read directly: the three.js GitHub source and examples, the nipplejs and three-pathfinding readmes, and search-result summaries for Alto, Monument Valley, Townscaper, Crossy Road, Kenney and Quaternius.

Every claim is tagged:

- **[S#]** means the fact was seen in a fetched page or search summary, listed in section 12.
- **[Rule]** means a studio rule of thumb from common industry practice. These are starting values to tune on a real device, not citations. Treat them as defaults you may overrule after a profile run.

Numbers marked [Rule] must be validated on the team's reference phones (section 9 of the budget sheet).

---

## 1. Art direction

### 1.1 Pillars

1. **Silhouette first.** Every prop and character must read as a solid black shape at 64 px tall. Kenney-style low poly is described as chunky faceted primitives with iconic silhouettes, flat colour, limited palette, hard simple shadows [S9]. Alto's artist describes "signal over noise", reducing things to the simplest, clearest depiction [S3].
2. **Few colours, strong value structure.** Alto limits the palette per area and lets the sky and weather dictate mood: cool blues for cold, warm gold for sunset [S3]. Monument Valley's palettes were tuned by pinning every screen on a wall as a colour script [S5]. We do the same: build a colour script of 6 key shots before modelling props.
3. **Light is the art.** Flat colour plus good light beats detailed geometry. Monument Valley used a custom directional lighting model, baked static AO, overdraw vignettes and faked volumetric glows [S5]. We copy the recipe: warm key, cool fill, baked AO, vignette, fake glow cards.
4. **Honest geometry.** Low poly means visible facets. Do not fight it with fake detail textures. Choose faceting density per asset class (below) and keep it consistent across the whole scene.

### 1.2 Shape language

- **Character and friendly props:** rounded-chunky. Bevelled boxes, low-segment cylinders (6 to 8 sides), icospheres at subdivision 1 (80 faces).
- **Architecture and street furniture:** straight and angular with slight bevel, so highlight catches the edge. Slight taper (1 to 3 degrees) and off-square corners remove the "CAD" feel [Rule].
- **Nature:** organic clumps built from icospheres, cones and displaced cylinders. Vary scale per axis (0.8 to 1.3) and rotate randomly on Y. Never repeat a tree exactly twice in view [Rule].
- **Contrast rule:** pair one big shape, one medium, one small in every prop (trunk, canopy, small leaf cluster; lamp base, pole, lantern) [Rule].
- **Tilt everything a little.** Vertical lines at exactly 90 degrees look sterile. A 1 to 4 degree random lean on trees, lamp posts and fences sells hand-made charm [Rule].

### 1.3 Chibi / stylised character proportions

Search summaries put chibi at 2 to 4 heads tall, with a head up to half to two thirds of total height, small hands and feet, thicker rounded body [S10].

Recommended for the park hero, total height 1.0 unit (about 1.0 m in world scale if the park is 1:1.6 scaled up, see budgets):

| Part | Value |
|---|---|
| Head height | 0.38 to 0.42 of total (about 2.5 heads tall) |
| Head width | slightly wider than tall, 1.05x |
| Torso | 0.28 of total, capsule or tapered box |
| Legs | 0.25 of total, short, stubby, 6-sided cylinders |
| Arms | 0.22 of total, hands as mitten blobs (no fingers) |
| Eyes | 2 flat dark dots or tall ovals, 12 to 18 percent of head width each, set low on the face (below head centre) for cuteness |
| Feet | oversized (1.3x) for stable stance and readable walk cycle |

Faceting for the character: 600 to 1200 triangles total body with hair and one hat, 8 to 10 sided limbs, head as a 12 x 8 low-segment sphere or a bevelled cube. Keep hair as a separate mesh (swap kit, section 5).

### 1.4 Flat versus smooth shading

- **Flat shading (flatShading: true or non-indexed geometry):** use for rocks, buildings, benches, canopy, ground planes. It is the low-poly signature [S7]. The cost is that a lit face is one solid colour per triangle, so lighting direction defines the facet read.
- **Smooth shading:** use for faces, hands, round cheeks and small rounded props if you want a softer toon read. Mixing is fine, but keep one rule: hard surfaces flat, soft organic characters smooth or creased.
- **Compromise:** `toCreasedNormals(geometry, creaseAngle)` in BufferGeometryUtils, default 60 degrees [S12]. Use 35 to 50 degrees on characters so that cheeks smooth but jaw and hat brim stay crisp [Rule].
- Note: flat shading in three.js with MeshStandardMaterial computes derivatives per fragment. On Lambert you get cheaper results with pre-split normals (non-indexed geometry via `geometry.toNonIndexed()` then `computeVertexNormals()`), which gives faceted look without the `flatShading` shader define [Rule].

### 1.5 Faceting density guide

| Asset | Visible facets (target) |
|---|---|
| Hero character | 600 to 1200 tris |
| NPC | 400 to 800 tris |
| Tree, large | 150 to 400 tris |
| Tree, small or bush | 40 to 120 tris |
| Rock | 20 to 60 tris |
| Bench | 80 to 160 tris |
| Lamp post | 60 to 140 tris |
| Fence segment | 30 to 80 tris (instanced) |
| Fountain (hero prop) | 600 to 1500 tris |
| Building background block | 12 to 60 tris |

Reference points: Quaternius nature packs run 36 tris for grass up to about 14k for a detailed well, average about 1336, with 5 trees at 1.08k to 4.96k and 7 fir trees at 260 to 2.42k [S11]. That is the upper bound for desktop. For a phone web game we run roughly one third of those densities.

---

## 2. Colour: palette construction

### 2.1 Method

1. **Choose a dominant temperature.** Golden hour: 60 percent warm (gold, peach, coral), 30 percent cool (lavender, teal, dusty blue shadows), 10 percent accent (magenta, cyan).
2. **Build ramps, not single colours.** Each material gets a 3 to 4 step ramp: shadow, base, light, glint. Hue-shift along the ramp: shadows drift toward blue and violet, highlights toward yellow and orange. This is described as the single biggest professional upgrade over just lowering brightness [S8].
3. **Complementary accents.** Warm world, so accent in the cool opposite (teal, cyan, violet) for graffiti, water, neon, character outfit. Use the accent in under 10 percent of screen area.
4. **Value before hue.** Squint test: convert screenshot to greyscale. Character, interaction spots and path must separate from background by at least 20 percent luminance [Rule].
5. **Desaturate distance.** Far layers take the horizon haze colour and lose 30 to 50 percent saturation per layer (atmospheric perspective, see section 4).
6. **Cap saturation.** HSV saturation 55 to 80 percent for the main world, up to 100 only for accents, UI and emissive.
7. **Colour script.** Make 6 key frames and paste them in a strip. Monument Valley's team judged palettes by seeing all levels together [S5].

### 2.2 How pros pick sunset palettes

- Anchor on three sky colours: a deep dusky top (blue-violet), a mid blend (lavender to pink), a luminous horizon (peach to gold). Search-sourced sunset palettes combine golden yellows, oranges, soft lavenders and peach pinks, for example #FFDAB9 peach, #E6E6FA lavender, #ec7825 orange, #fecd82 champagne, #80bddd dark sky blue [S13]. Our final values are in palette_and_budgets.md.
- Light colour is not the same as sky colour. The sun should be lighter and less saturated than the horizon band (about #FFD7A0) because bloom and tone mapping will push it.
- Shadows are never black. Tint them with the opposite hue of the key (violet or deep blue at 25 to 40 percent brightness). In three.js you do this with the hemisphere light ground and sky colours rather than a black ambient.

### 2.3 Gradients on low poly

Three options, from cheapest:

1. **Vertex colours.** Paint a vertical gradient per mesh (dark teal at tree base to golden green at top, dark brick bottom to lit top). Zero extra textures, zero extra draw calls. Needs `material.vertexColors = true` and a `color` BufferAttribute with 3 floats per vertex [S7 via three.js example webgl_geometry_colors, S14].
2. **Gradient skydome.** A large inside-out sphere or a full-screen quad with a vertical gradient shader, mixing 3 to 4 colour stops by normalised world Y. The three.js hemisphere-light example uses exactly this pattern: sky shader mixing top and bottom colours by height, with the scene fog colour matched to the bottom colour [S15]. Set `fog` colour equal to the horizon colour or distant objects will outline against the sky.
3. **Palette atlas texture.** A 64 x 64 or 128 x 128 swatch image, every vertex UV mapped into a swatch cell. One material for the entire scene lets you batch draw calls and recolour the whole game by editing one image [S16 summary]. Use `NearestFilter` for both min and mag, no mipmaps, `colorSpace = SRGBColorSpace` [Rule].

### 2.4 Texture-less versus atlas workflow

| Approach | Pros | Cons | Use for |
|---|---|---|---|
| Vertex colours only | no textures, easy AO bake, gradients free | 3 floats per vertex, painting tool needed | everything except UI and graffiti |
| Palette atlas (UV to swatch) | single material, easy global recolour | UV chore, bleeding if mipmaps on | hero props, character |
| Small tiling textures | detail | breaks flat style, memory | avoid except graffiti and signs |

Recommended: **vertex colours plus a few tiny textures** (graffiti murals, signage, UI icons, a 4 x 1 toon gradient ramp). Everything else texture-free.

---

## 3. Environment recipes

### 3.1 Avoiding "primitive soup"

The look arises when shapes are placed with no hierarchy, no grouping, no variation, no wear, and every colour has equal weight. Counter measures:

1. **Compose in clusters**: groups of 3 (odd numbers), one large, one medium, one small.
2. **Scale variance** 0.8x to 1.3x per instance, plus random Y rotation and 1 to 4 degree tilt.
3. **Ground contact:** every prop has a ground patch, shadow blob (dark disc at 20 to 30 percent alpha, 1.2x the footprint), grass tuft ring, or dirt scuff. Floating props are the number one amateur tell.
4. **Secondary shapes:** add a base plinth to the lamp, a cap on the bench armrest, a trim line on the wall. Detail comes from silhouette variation, not texture.
5. **Wear and storytelling:** a dropped umbrella, a chalk hopscotch on the path, a pigeon group, a skate sticker, a stack of crates behind the mural, a lost balloon stuck in a tree.
6. **Value hierarchy:** the interaction spots get the highest contrast and a saturated accent. Backgrounds low contrast.
7. **Negative space:** leave 30 to 40 percent of the ground plainly walkable, with one calm grass colour.

### 3.2 Trees (several species)

Technique reference: Blender tutorials model a low-poly tree with a trunk from a cube and an icosphere canopy scaled differently per axis [S17]. Quaternius trees range 260 to 4960 tris [S11]; we go smaller.

| Species | Recipe | Tris |
|---|---|---|
| Round broadleaf (oak) | trunk 6-sided tapered cylinder 2 segments (24 tris), 3 to 5 icospheres sub 1 (80 faces each) clumped, flat shaded, scaled 0.8 to 1.2 per axis, vertex colour dark base to warm top | 250 to 450 |
| Pine / fir | 3 to 4 stacked cones, 7 sides, each wider at the base, offset 0.1 on XZ, rotated 20 degrees each | 100 to 180 |
| Cherry / blossom | thin forked trunk, 5 low-poly clouds (icosphere sub 1 with random vertex jitter 8 percent), pink to magenta vertex gradient, petals as a few instanced quads on the ground | 200 to 350 |
| Palm / city street tree | thin lean trunk (bend with 3 segments), lollipop canopy as a squashed icosphere, plus a grate square at the base | 120 to 220 |
| Birch | white trunk with dark band decals as vertex colour, small light-green canopy blobs | 150 to 250 |
| Dead / autumn accent | oak recipe with orange to red canopy ramp | 250 to 450 |

Canopy techniques:

- **Vertex jitter:** randomise canopy vertices by 5 to 10 percent of radius so clumps are not perfect spheres.
- **Colour variance per clump:** shift hue by plus or minus 8 degrees and lightness by plus or minus 6 percent through vertex colour.
- **Backlit canopy:** top facing sun gets the hue-shifted yellow-green (about #C9D65A), underside deep teal-green (#2F5D5A).
- **LOD for background trees:** one icosphere on a stick, 30 tris.

### 3.3 Grass and ground variation

- Ground is a subdivided plane (e.g. 40 x 40 quads, 3200 tris) with **vertex colour noise**: base #7FA84A, patches of #B7C95A and #4A7A45 at low frequency (about 1 patch per 4 world units), plus a slow gradient toward the horizon haze colour.
- **Grass tufts:** InstancedMesh of a 2 to 3 triangle blade cluster (6 to 9 tris), 1500 to 3000 instances on a phone, single draw call. Vary height 0.7 to 1.3 and tint 10 percent. Optionally sway with a vertex shader sine wave on top vertices only (amplitude 0.03 to 0.06 world units, frequency 1 to 2 Hz) [Rule].
- **Flowers and clover:** another InstancedMesh with 4 to 8 tris, 150 to 400 instances in clusters.
- **Edge breakup:** where grass meets path, use a ragged border mesh (dirt-coloured, 1 triangle strip with random width) rather than a hard straight line.

### 3.4 Paths

- Sandy/stone path ribbon with 0.02 height above the grass to avoid z-fighting, `polygonOffset: true` (factor -1, units -1) on the material [Rule].
- Colour ramp: base #E9C9A0, darker edge #C99A78, speckles of #A0705A as vertex colours.
- Tile hint without textures: a handful of thin darker quads or inset hex pavers (instanced, 12 tris each, 200 instances).
- Walkable width at least 2.5 times the character width so tap-to-move feels forgiving on a phone.

### 3.5 Water and fountains

- Water plane: low-subdivision plane (16 x 16 quads) with a gentle vertex sine displacement in the shader (amplitude 0.02, speed 0.6), flat normals, semi-transparent (opacity 0.8) teal #4FB6C9 with lighter foam #F4F1E6 as a vertex-colour rim near the edge.
- Cheap sparkle: 20 to 40 additive quads with sine-based flicker, or a small bright noise texture scrolling at 0.05 UV per second.
- Fountain: three stacked bevelled cylinders (basin, mid bowl, top bowl), 8 to 10 sides, plus 12 to 20 instanced "droplet" quads or small tetrahedra on parabolic paths driven in the vertex shader (no CPU per-frame). Keep alpha-blended particles under 60 for fill rate.
- Reflection: skip real reflections. Use a mirrored low-detail sun gradient fresnel based on view angle, in a 10-line shader.

### 3.6 Rocks

- Icosphere sub 0 or sub 1, random vertex noise 15 to 25 percent, scale non-uniformly (1.0, 0.6, 0.8), flat shaded, 20 to 60 tris.
- Colour ramp: #B9AFB8 top, #8D8397 side, #5D5470 base. Cool grey with violet shift, never neutral grey.
- Clusters of 3 with one half-buried under the ground plane.

### 3.7 Benches, lamp posts, fences, bins

- **Bench:** seat slats as separate boxes (3 to 5), two angled legs, optional armrest cap. Wood #A66B3F, metal #3A3A4F. About 100 tris.
- **Lamp post:** tapered 6-sided pole, small decorative collar, lantern box with an emissive inner box (#FFC46B). Add a fake glow: additive billboard quad, 2 to 3 units wide, opacity 0.35, depthWrite false. Real PointLights are expensive on mobile; use at most 0 to 2 per scene and bake the rest as vertex colour tint on the ground plus glow cards [Rule].
- **Fence:** 1 instanced picket (12 tris), 1 instanced rail (12 tris), per-instance 3 degree random tilt and 4 colour variants. Instances also use `setColorAt` for chipped paint look.
- **Bins, hydrants, signposts:** all in the 30 to 80 tris range, each with a bright accent colour to give visual rhythm.

### 3.8 Brick wall with graffiti murals

- Wall as a single box (12 tris) with a **low-res tiling brick texture** (128 x 64 repeating) OR vertex-colour banding and a few extruded "brick course" stripes. The texture route reads better at distance; the geometry route keeps the flat style. Recommendation: geometry bands (every 4th course 0.01 proud) with vertex-colour variation #B5573F, #8E3F3B, mortar #D9B79E.
- **Mural:** a single plane decal with a 512 x 256 or 1024 x 512 painted flat-colour texture (limited to 6 palette colours, hard edges), `transparent: true`, `alphaTest: 0.5` to avoid sorting, offset 0.005 from the wall. Use `NearestFilter` or `LinearFilter` without mipmaps for crisp edges; mipmaps are fine on a 512 mural at distance.
- **Mural palette:** magenta #FF4F8B, teal #29D3C7, yellow #FFD23F, violet #7B5CFF, off-white #FFF2DC, ink #2B2438.
- Add stickers, a drip run (vertical gradient quad), a tag in a second small decal, and one wall-lamp glow to make the wall a story.
- Make the mural an interaction candidate: the wall can host a "paint" mini game spot with a glowing outline.

### 3.9 Skylines and background layers

- 3 to 4 silhouette layers of buildings and tree lines. Each layer is a flat or lightly extruded strip mesh with flat unlit colour (MeshBasicMaterial, fog true) and 20 to 60 tris.
- Colours step toward the horizon haze: #8F7AA8, then #B995B5, then #F0B79A (see palette sheet).
- Place 40 to 120 world units from the camera, sized so parallax stays minimal. Alto's background uses muted colours and different parallax rates to separate layers [S3].
- Add lit windows as emissive instanced quads at dusk (50 to 200 instances, 1 draw call) with random on/off, colour #FFC46B.
- Add a slim sun disc (additive quad, 6 to 10 units wide, #FFE2A8) with a larger soft halo.

### 3.10 Clutter and storytelling props

Park-specific list: bike with lock, skateboard, picnic blanket with basket, coffee cup on bench, hopscotch chalk, pigeons (6 to 10 instanced), kites in trees, balloon, boom box near the beatbox spot, chalk drawings, street-food cart with string lights, notice-board with colourful flyers, cherry-blossom petals in the air. Budget 20 to 40 unique clutter meshes, all instanced or merged.

---

## 4. Lighting and mood

### 4.1 Golden-hour rig (three.js)

Values to start from, for a renderer using `ACESFilmicToneMapping` (as in the three.js bloom example [S18]) and `outputColorSpace = SRGBColorSpace`.

- **Key (DirectionalLight):** colour #FFC783, intensity 2.6 to 3.2 (three.js physical units r155+), elevation 14 to 22 degrees above the horizon, azimuth about 35 degrees off the camera view so shadows fall diagonally toward the camera-left. Low sun gives long, readable shadows.
- **Fill (HemisphereLight):** sky #9FB4E8 (cool), ground #B9794F (warm bounce), intensity 0.9 to 1.2. The three.js hemisphere example uses a blue-ish sky colour and a warm yellowish ground colour [S15].
- **Rim (second DirectionalLight, no shadows):** colour #FF8FB0 or #FFD2A0, intensity 0.8 to 1.2, positioned opposite the key, low elevation 10 to 25 degrees, grazing the character's back. This lights the hair and shoulders and separates the character from the background.
- **No ambient light** unless the hemisphere is insufficient; a flat ambient kills facet read.
- Optional: a very faint cool fill DirectionalLight (#7A8CC9, 0.3) from the camera side, no shadows, to open the facing shadows.
- Tone mapping exposure 0.9 to 1.1; test ACESFilmic for punch and Neutral/AgX for less hue skew. ACES desaturates and shifts bright saturated oranges toward yellow [Rule].

### 4.2 Shadows on mobile

- One shadow-casting light only (the key). three.js shadow example setups use 1024 x 1024 map and an orthographic shadow camera with +/-15 units extents [S19]; the hemisphere example uses 2048 [S15]. Phone default: **1024**, maybe 2048 on high-tier devices after a perf check. One devlog notes defaults of about 2K for desktop and 512 for mobile [S16].
- Fit the shadow camera tightly to the play area: left/right/top/bottom = +/-12 to 18, near 1, far 60. Texel size = extent*2 / mapSize; at 30 units and 1024 map that is about 0.03 units per texel, fine for chibi characters.
- **Follow the player:** snap the shadow camera centre to the player position rounded to the texel size to avoid shimmering [Rule].
- **Type:** `PCFSoftShadowMap` looks soft and cheap enough at 1024. `VSMShadowMap` is smoother but costs more and shows light bleeding. `BasicShadowMap` is the cheapest but aliased. Start with PCFSoft.
- **Bias:** `shadow.bias = -0.0005`, `shadow.normalBias = 0.02` (world units) to cure acne on flat-shaded faces, raise normalBias before bias to avoid peter-panning [Rule]. Verify with the shadow camera helper.
- Do not let everything cast: casters = character, trees, lamp posts, benches, wall. Receivers = ground, path, wall. Skip small clutter and grass.
- **Blob shadows** (dark disc, 25 percent alpha) for NPCs, clutter and distant objects.
- `renderer.shadowMap.autoUpdate = false` plus manual `needsUpdate = true` is valid when only the character moves: re-render shadows every frame if the character casts, or every 2nd frame at 30 Hz updates [Rule]. Alternative: bake static-object shadows into vertex colours and let only the character cast dynamically.

### 4.3 Baked ambient occlusion in vertex colours

- Bake AO per-vertex in Blender (add-ons such as Vertex Oven and Vertex Color Octopus exist for this; native Blender 2.8+ lost the old Blender Internal vertex bake) [S20]. The result avoids texture memory, ideal for mobile.
- Multiply base colour by AO in the vertex colour channel: AO ranges 0.55 (crevice) to 1.0 (open). Tint the occluded colour toward violet rather than grey: lerp(base, shadowTint #5A4B8A, (1 - ao) * 0.5).
- Cheap runtime fake: darken vertices below Y = 0.2 on all props (ground contact darkening) as a gradient. 5 minutes of code, huge payoff.
- Monument Valley relied on lightmapped static AO plus custom lighting [S5].

### 4.4 Fog and atmospheric perspective

- Use linear `THREE.Fog(horizonColor, near, far)`. Starting values for a 3/4 camera at about 18 units from the target: near 25, far 90. Fog colour equals the horizon band of the skydome #F0B79A. Match fog and sky bottom [S15].
- Per-layer tint: nearer fog is warmer (peach), far fog more violet. For this, a custom fog chunk can mix between two colours by distance; simpler: use a gradient skydome and set material colours of background layers manually.
- Height fog (cheap): add a vertical term in the shader so low areas (water, ground) haze more. Optional.

### 4.5 Light cones, god rays, glows

- **Fake god rays:** 4 to 8 long tapered quads or open cones from the sun direction, additive blending (`THREE.AdditiveBlending`), opacity 0.06 to 0.12, `depthWrite: false`, slow opacity sine modulation 0.1 Hz. Face them toward the camera as billboards on one axis. This is more than 10x cheaper than a screen-space radial blur pass [Rule]. Monument Valley faked volumetric glows with overdraw too [S5].
- **Lamp glow:** additive sprite 1.5 to 3 units, opacity 0.3 to 0.5, colour #FFC46B, pulses 3 percent.
- **Dust motes / pollen:** 60 to 120 `Points` with soft round sprite, size attenuated, drifting at 0.05 units per second, caught in the light cone.
- **Lens flare:** one small hex ghost sprite aligned to sun, cheap and effective (Alto uses occasional lens flare [S3]).

### 4.6 Emissive neon and bloom

- Neon sign: `MeshBasicMaterial` (colour multiplied above 1 by `toneMapped: false` plus `color.multiplyScalar(2.5)`) so only neon exceeds the bloom threshold.
- **UnrealBloomPass:** constructor `(resolution, strength=1, radius, threshold)`; 5 mips with kernel sizes [6, 10, 14, 18, 22]; default resolution 256 [S21]. three.js examples default to threshold 0, strength 1, radius 0.5 [S18, S22]; for us: **threshold 0.85, strength 0.5 to 0.7, radius 0.4**, resolution = half of the render size [Rule]. Search summaries cite typical strength 0.8 to 1.5, radius 0.4 to 0.8, threshold 0.6 to 0.85 [S2].
- **Selective bloom:** either the layer-darken approach from the three.js selective-bloom example (two renders per frame, expensive) [S22], or the cheaper route: high threshold and only neon above 1.0 in HDR. Pick the threshold route for mobile.
- Mobile alternative: skip the composer entirely and use additive glow sprites for neon and the sun. That is the baseline; enable real bloom only on devices that hold 55+ FPS in the first 3 seconds (adaptive quality, section 5.9).

### 4.7 Colour grading, tilt-shift, vignette

- **Colour grading:** a single full-screen pass with a 3-term lift/gamma/gain or a 16 x 16 x 16 LUT strip (256 x 16 texture). If no composer, bake the "grade" into the palette and the tone mapping.
- **Tilt-shift:** the three.js `HorizontalTiltShiftShader` uses uniform `h` (blur offset, default 1/512) and `r` (focus line, default 0.35), a 9-tap horizontal Gaussian whose width scales with distance from `r` [S23]. Use two passes (H and V) with `r` about 0.5 and `h` of 1/viewport width * 1.5. Cost: two extra full-screen passes. At half resolution it is acceptable on high-tier phones only. Cheap fake: a gradient blur overlay in CSS at the top and bottom edges plus a vignette (zero shader cost) [Rule].
- **Vignette:** a CSS radial-gradient overlay (rgba(60,30,80,0.35) at the corners) is free of GPU post-processing. Also Monument Valley used overdraw for vignetting [S5].
- **Sky:** gradient dome (3 to 4 colour stops), 1 sun disc, 8 to 14 flat-colour cloud shapes (low-poly stretched icospheres, MeshBasic, colour #FFD7B8 lit side / #C98BA8 underside), slow drift 0.2 units per second.

---

## 5. Character craft

### 5.1 Construction

- Build in Blender with a mirrored half, bevelled box and capsule primitives, apply mirror, then separate: head, hair, body, arms, legs, shoes, hat. 
- Hands and feet are mittens and blocks. Faces are a few flat dark dots as vertex colour or two tiny separate meshes; blink by scaling eye Y to 0.1 for 80 ms every 3 to 5 s.
- Weight: max 4 influences per vertex (the glTF limit) [S24]; for this rig use 1 to 2 influences and rigid segmentation where possible, with a tiny joint overlap, since low-poly faceted limbs animate fine with rigid parts.
- **Rig size:** 15 to 22 bones: root, hips, spine, chest, neck, head, 2 x (shoulder, upper arm, lower arm, hand), 2 x (thigh, shin, foot), plus hair and bag/scarf optional chain bones.
- Alternatively skip skinning: build the character from separate meshes parented in a Group hierarchy (pelvis, torso, head, 2 arms, 2 legs) and animate transforms procedurally. For chibi characters with rigid parts this is cheaper, simpler and gives precise squash and stretch control.

### 5.2 Customisation

- **Swappable meshes:** hair kit (8 to 12 styles, 40 to 120 tris each), hats (8 to 10, 30 to 100 tris), glasses, backpacks. All authored against the same head/torso attachment bone origin so they snap on. Swap by adding or removing a child of the head bone.
- **Recolourable materials:** use vertex colour as a mask. Channel convention: vertex colour R = skin zone, G = outfit primary, B = outfit secondary on a dedicated attribute, then a tiny `onBeforeCompile` patch or just separate materials per zone with `color` uniforms. Simplest robust approach: one material per zone (skin, hair, top, bottom, shoes, accent), each a `MeshLambertMaterial` with its own `.color`, 6 materials per character.
- **Palette swatches:** offer 8 preset skin tones (from #F6D1B1 to #6B4026, see palette sheet) and 12 outfit swatches from the master palette so customised characters never clash with the world.
- Merge all static customisation into one skinned mesh at load to keep draw calls under 6 per character.

### 5.3 Animation principles for stylised characters

- **Idle:** 2 to 3 s loop. Breathing: torso scale Y 1.0 to 1.02 at 0.4 Hz; head tilt plus/minus 2 degrees at 0.2 Hz; blink every 3 to 5 s; weight shift every 6 to 8 s.
- **Walk:** step frequency 2.2 to 2.8 Hz for a cute quick gait (1.1 to 1.4 cycles per second per leg). Body bob amplitude 0.04 to 0.06 of character height, double the step frequency. Leg swing 28 to 35 degrees, arm counter-swing 20 to 25 degrees, torso yaw 5 degrees counter to hips, head lag of 1 frame. Lean forward 4 to 8 degrees proportional to speed. Foot contact squash: scale Y 0.92, scale XZ 1.06 for 80 ms.
- **Run:** same with frequency 3.5 to 4.2 Hz, larger lean (12 to 15 degrees).
- **Dance:** loop of 4 to 8 beats at 100 to 125 BPM. Anchor poses on beats: arms up on 1, hip drop on 2, spin on 4. Use `pose[i]` keyframes lerped with an easing curve (cubic out for hits, cubic in-out for transitions).
- **Beatbox:** head nod synced to the beat, jaw/mouth scale Y open-shut on each hit (a 0.06 s open then close), a puff scale of the cheeks at 1.15 on bass hits, little hand cupped near mouth, audio-driven amplitude through an `AnalyserNode` (low-frequency band energy 0 to 1 scales the head bounce, 0.05 units).
- **Squash and stretch** [S25]: keep volume: scaleY = 1 + s, scaleXZ = 1 / sqrt(1 + s). Typical: jump anticipation s = -0.12 over 100 ms, take-off stretch s = +0.15, landing s = -0.18 recovering with a damped spring.
- **Secondary motion:** hair tuft, scarf, backpack and ear flaps follow with a spring: `v += (target - x) * k * dt; v *= exp(-c * dt); x += v * dt` with k = 90 to 160, c = 6 to 10. Overshoot is what the eye reads as life. Search results confirm spring-based hair and cloth as the standard secondary-motion approach [S25].
- **Anticipation, follow-through, overlap, arcs:** step 1 lean back 80 ms before a jump, step 2 launch, step 3 hold hands up 100 ms after landing.
- **Easing cheat sheet:** hits (landing, impact) use easeOutBack with overshoot 1.4; settles use critically damped spring; loops use sine.

### 5.4 Procedural animation and IK in three.js

- three.js ships `CCDIKSolver` in examples/jsm/animation. Config is an `iks` array: `target` (bone index), `effector` (bone index), `links` (array of bone index plus optional `rotationMin`/`rotationMax` Vector3), call `solver.update()` after mixer update [S26]. Use it for: hand reaching toward an interaction target, head look-at (a 1-link chain with limits plus/minus 40 degrees), foot planting on slopes.
- For chibi legs a two-bone analytic IK (law of cosines) is 20 lines and cheaper than CCD. Use it for foot planting and for the leg when sitting on a bench.
- **Head look-at:** compute the angle to the nearest interaction point within 6 units, clamp yaw to plus/minus 50 degrees and pitch to plus/minus 20 degrees, damp with `1 - exp(-8 * dt)`.
- **Mixer:** `AnimationMixer` with `crossFadeTo` 0.15 to 0.25 s between idle, walk and interaction clips. Run `mixer.update` at full rate only on the hero; NPCs update at 15 to 20 Hz [Rule].
- Procedural walk: drive leg and arm angles with `sin(phase)` where `phase += speed * k * dt`; this removes foot sliding because phase follows actual velocity.

---

## 6. three.js implementation

### 6.1 Materials

| Material | Cost | Look | Verdict for this project |
|---|---|---|---|
| MeshBasicMaterial | cheapest, unlit | flat | sky, far layers, glow cards, neon |
| MeshLambertMaterial | cheap, diffuse only; per-fragment since r144 but still much cheaper than Standard [S27] | soft diffuse, no specular | **default for world and characters** |
| MeshToonMaterial | cheap-ish, gradientMap | banded light | optional for characters |
| MeshStandardMaterial | expensive PBR, hard for some mobiles to fill the screen [S27] | physical | only for hero prop (water, metal) if budget allows |

- MeshToonMaterial `gradientMap`: a DataTexture of size `colors.length x 1`, `RedFormat`, tone values `(c / colors.length) * 256`, `NearestFilter` for hard bands [S28]. For 3 bands use [90, 170, 255]. Gives a shaded cartoon read on the character while the world stays Lambert.
- `flatShading: true` is available on Lambert, Phong, Standard.

### 6.2 Vertex colours

```
geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
```

Vertex colour is multiplied with material colour; keep material colour white. Colours in the attribute are interpreted as linear in recent three.js, so convert your sRGB hex with `new THREE.Color(hex)` (which converts for you with ColorManagement enabled) [S14]. Use `Uint8Array` normalised attributes (`normalized: true`) to cut memory by 75 percent [Rule].

### 6.3 Merging and instancing

- **Static scenery:** merge per material using `BufferGeometryUtils.mergeGeometries(list, useGroups)`; all geometries must have identical attribute sets (position, normal, color) [S12]. Bake the world matrix into each geometry first (`geometry.applyMatrix4`). Merge by spatial chunks (e.g. 16 x 16 unit tiles) so frustum culling still works: target 20 to 40 chunks, each 2k to 8k tris.
- **Repeats (trees, fences, grass, pavers, windows, lamps):** `InstancedMesh(geometry, material, count)` with `instanceMatrix` set once, `instanceMatrix.setUsage(THREE.StaticDrawUsage)` for static; use `DynamicDrawUsage` only if updated each frame [S29]. Per-instance tint via `setColorAt`. Instanced meshes are culled as one object by their bounding sphere: call `computeBoundingSphere()` after placing or split into chunks.
- **Many distinct meshes sharing a material:** `BatchedMesh` (r159+) [S1].
- Vertex dedup: `mergeVertices(geometry, 1e-4)` before computing smooth normals [S12].
- Dispose: when swapping scenes call `geometry.dispose()`, `material.dispose()`, `texture.dispose()`; check `renderer.info.memory` for leaks.

### 6.2b Shadows: see section 4.2. Hemisphere plus one directional is the whole light budget.

### 6.3 EffectComposer

Chain: `RenderPass` then (optional) `UnrealBloomPass` then `OutputPass` (does tone mapping and colour-space conversion) [S30]. Every pass is a full-screen render; reduce resolution for blur passes and profile on a phone [S2].

Mobile guidance [Rule]:

- Use post-processing only on devices that meet the adaptive quality gate.
- Render the composer at `min(devicePixelRatio, 1.5)`; set bloom resolution to half.
- MSAA: `renderer.antialias = true` costs less than FXAA/SMAA passes on tile-based GPUs when rendering directly. With a composer, plain MSAA is lost unless you use a multisampled render target (`samples: 4`, WebGL2); prefer 2 samples on phones.
- Skip SSAO, SAO, DoF bokeh, SSR on phones.

### 6.4 Outlines

- **Inverted hull:** second mesh with the same geometry, `side: THREE.BackSide`, `MeshBasicMaterial` ink colour #2B2438, vertices pushed along normals by 0.01 to 0.03 units (use view-space width for consistency). Doubles triangles, fine for characters at 600 to 1200 tris [S31]. For hard-normal meshes use normalised local position rather than the vertex normal to avoid gaps [S31].
- **Post-process OutlinePass:** parameters edgeStrength 0.01 to 10, edgeThickness 1 to 4, edgeGlow 0 to 1 [S32]. Use it only for the selected interaction object (one object), not for everything: it renders the selection multiple times.
- Recommended: no global outlines (keeps the Monument/Alto look). Character gets an inverted hull at 0.015 units in a dark tint of its own base colour. Interaction spots get a pulsing ring (a mesh) rather than OutlinePass.

### 6.5 Custom gradient fog and sky

- Sky: a `ShaderMaterial` on a sphere, `side: BackSide`, `depthWrite: false`, `fog: false`, `renderOrder: -1`. Fragment colour = mix of 4 stops by `normalize(vWorldPosition).y` with `smoothstep` bands [S15].
- Make sure scene.fog.color equals the horizon stop. For a gradient fog, patch with `onBeforeCompile` to replace `fogColor` by a mix of horizon and zenith by view direction Y [Rule].

### 6.6 Renderer settings and DPR

```
renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));   // low-tier: 1.25
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

- DPR cap: 2.0 for tier A, 1.5 for tier B, 1.0 to 1.25 for tier C. A 1170 x 2532 iPhone at DPR 3 is 8x the pixels of DPR 1 at the same CSS size; cap is the biggest single fill-rate lever [Rule].
- **Dynamic resolution:** measure frame time over 30 frames; if above 20 ms drop DPR by 0.25 down to 1.0; if below 12 ms for 120 frames raise it. Never go below 0.75 x on the character-critical view.
- Pause rendering on `visibilitychange`; cap to 30 FPS when idle and no animation (static scene) to save battery and heat.

### 6.7 Mobile GPU pitfalls

- **Overdraw / fill rate:** transparent particles, glow cards, god-ray quads and big cloud sprites stack fast. Keep the sum of transparent screen coverage under 1.5x full screen [Rule]. Sort and use `alphaTest` where possible, `depthWrite: false` on glow.
- **Precision:** use `precision mediump float` in custom fragment shaders only for colour math; keep world-position and time calculations in highp. Large UV offsets on a long time value lose precision; wrap `time % 1000`.
- **Thermal throttling:** a phone that holds 60 FPS for 30 s often drops to 30 after 5 minutes. Test with a 10 minute soak. Cap to 45 or 30 FPS on tier C and reduce DPR gradually.
- **Texture memory:** every texture costs width x height x 4 bytes plus 33 percent for mipmaps; 1024 x 1024 = 5.3 MB. Keep total under 40 MB [Rule].
- **Non-power-of-two and mipmaps:** the palette atlas has no mipmaps, nearest filter.
- **Frustum culling:** leave on; chunk merges to preserve it. Add a manual distance cull for clutter beyond 60 units (set `visible = false`).
- **Draw calls:** target under 100 draw calls per frame on mobile (search summary guidance) [S1]; our budget sheet sets 60 to 90.
- **Shader compile hitch:** call `renderer.compile(scene, camera)` or `compileAsync` during loading, and warm up the shadow map.

### 6.8 Camera rig (3/4 view, portrait)

- **Perspective with a narrow FOV** reads like isometric but keeps depth: FOV 30 to 38 degrees vertical, camera distance 16 to 22 units from the target, pitch 40 to 50 degrees down, yaw 35 to 45 degrees (fixed, or allow plus/minus 20 degrees drag). Pure orthographic (like Monument Valley's isometric three-colour faces [S5]) gives stable pixel-like silhouettes and no perspective distortion, and it culls less aggressively; both are fine. Recommend perspective FOV 32 for charming depth, atmospheric fog works only with perspective [Rule].
- **Portrait framing:** vertical FOV drives what you see; for width W and portrait aspect 9:19.5 the horizontal view is narrow, so set `camera.fov` so the horizontal visible width at the target is at least 11 to 13 units: `fovV = 2 * atan(tan(fovH / 2) / aspect)`; recompute on resize. Keep the character at 38 to 45 percent from screen bottom (a bit below centre) so the thumb zone and look-ahead have room.
- **Follow:** `camera.position.lerp(desired, 1 - exp(-5 * dt))` for position, look-ahead offset of 1.0 to 2.0 units along velocity, damped with 3 per second. Dead-zone radius 0.5 units before the camera starts to move.
- Interaction zoom: ease FOV or distance by 15 to 25 percent when entering a mini game spot (0.6 s easeInOutCubic).
- Collision: with fixed pitch and open park, no camera collision is needed; fade trees between camera and character by dithered alpha or hide canopies via a screen-space distance rule.

### 6.9 Navigation: tap-to-move

- Grid A*: park as a 64 x 64 grid at 1 unit per cell (or 0.5 for tight spaces). 4096 to 16384 cells. Blocked cells from props footprints. A* with 8-way moves and an octile heuristic runs in under 1 ms for this size. Smooth the path with string-pulling (line-of-sight shortcut) and follow with a pure-pursuit steering at speed 3.5 to 4.5 units per second.
- Tap to world: raycast from the touch point to the ground plane (`Raycaster` with a single large plane mesh, or analytic ray-plane intersection with no scene traversal; the analytic way is cheapest). Snap to the nearest walkable cell if the tap is on a blocked cell. Show a tap marker (ring, 0.5 s fade).
- Navmesh: `three-pathfinding` computes paths on a prebuilt navmesh authored in Blender or Recast, exported as glTF or OBJ; API: `Pathfinding.createZone(geometry)`, `findPath(start, end, zoneID, groupID)`, `clampStep` [S33]. Worth it only if the park has many irregular obstacles; grid A* is simpler and enough here.
- **Virtual joystick:** nipplejs supports `dynamic`, `static`, `semi` modes, size default 100 px, events `start`, `move`, `end`, `lockX/lockY` [S34]. Recommended: `dynamic` mode in the bottom-left 40 percent of the screen, size 110 to 130 px, deadzone 0.15, output normalised vector times analog speed. Support BOTH: tap-to-move on the right, joystick on the left; or joystick appears on touch-hold (300 ms) so tap stays tap.
- Input vector is camera-relative: rotate by camera yaw.

### 6.10 Interaction prompts and world-space markers

- **Interaction spots:** a glowing ring decal on the ground (additive, radius 1.2 to 1.5 units, colour accent #35F2E0 or #FF3D9A, pulse scale 1.0 to 1.08 at 1.2 Hz) plus a floating icon above the spot that bobs 0.1 units at 0.8 Hz.
- **Trigger radius:** 1.4 units from centre to open the prompt, hysteresis 1.8 units to close, so the prompt doesn't flicker.
- **Prompt UI:** DOM overlay anchored with `Vector3.project(camera)`; button at least 44 x 44 CSS px (use 56 px), label of 1 to 2 words. Use a billboard sprite only for the icon, DOM for text so it stays crisp and accessible.
- **Highlight on approach:** object rim colour boost via `emissive` +0.15 or a one-object OutlinePass [S32].
- **Off-screen markers:** arrow at the screen edge pointing to the nearest undone mini game.
- **Haptics:** `navigator.vibrate(10)` on interaction.

---

## 7. Performance budgets (summary, full table in palette_and_budgets.md)

- Frame: 16.6 ms for 60 FPS; 33 ms fallback for tier C.
- Draw calls: 60 to 90 total; under 100 is the commonly cited mobile target [S1].
- Triangles on screen: 80k to 150k for tier B, 200k for tier A, 50k for tier C [Rule].
- Textures: palette atlas 128 x 128, mural 512 x 256 or 1024 x 512, UI atlas 1024 x 1024, total under 40 MB.
- Lights: 1 hemisphere, 1 or 2 directional, 0 to 2 point lights. 1 shadow caster.
- Post-processing: 0 passes on tier C, bloom at half res on tier B, bloom plus tilt-shift on tier A.

---

## 8. Reference game lessons

- **Monument Valley:** limited geometry, hand-tuned palette per level, colour script on a wall, custom lighting shader, lightmapped AO, overdraw vignette and glow [S5]. Takeaway: a handful of shapes with good colour and one strong lighting model beats complex geometry.
- **Alto's Odyssey:** minimal shapes, sky-led palette, parallax layers with muted background, dark fading gradients for glare, lens-flare accents [S3]. Takeaway: gradient sky plus layered silhouettes does 80 percent of the mood.
- **Crossy Road:** voxel look keeps performance consistent over a wide range of devices; characters are chunky and instantly readable [S35]. Takeaway: strict constraints (one grid, one scale, one outline rule) produce coherence and speed.
- **Townscaper / Bad North (Oskar Stalberg):** handcrafted tiles assembled procedurally via Wave Function Collapse; minimalist UI, vibrant palettes [S36]. Takeaway: small hand-authored kit pieces plus rules produce variety without primitive soup.
- **Kenney / Quaternius:** coherent kits with a shared palette; chunky faceted primitives, flat colours, hard shadows [S9, S11]. Takeaway: build a kit, not one-off assets.
- **A Short Hike, Islanders, Poly Bridge, Superhot:** I could not fetch dedicated breakdown pages for these; the shared lessons from the sources I did read (limited palette, simple silhouettes, strong single light direction, clean UI) apply, and I mark any further claims about them as unverified.

---

## 9. Pipeline and process

1. **Week 0:** colour script (6 frames), palette locked in a JSON file (`palette.json`) imported by both Blender scripts and the three.js code.
2. **Kit-first:** model 30 to 40 kit pieces, test them in one lit scene early (grey box plus lights) before detailing.
3. **Blender export:** glTF binary (.glb), apply transforms, vertex colours as `COLOR_0`, Draco or meshopt compression if file size matters (meshopt decodes faster on phones), no embedded textures except palette.
4. **Asset budget CI:** a script that loads each glb and fails the build if tris exceed budget.
5. **Perf harness:** an on-screen stats overlay (`renderer.info.render.calls`, `.triangles`), a long-run soak mode, and device tier detection (GPU string, `navigator.hardwareConcurrency`, a 2 second benchmark).
6. **Reference devices:** one 4-year-old Android mid-range (Snapdragon 6-series class), one recent iPhone, one budget Android.

---

## 10. Do and Do not

### Do

1. Do design silhouettes first and test at 64 px.
2. Do hue-shift every ramp (cool shadows, warm lights) [S8].
3. Do keep one dominant key light direction for the whole scene.
4. Do put a warm key, cool hemisphere and a rim on the character.
5. Do bake AO into vertex colours; add a ground-contact gradient to every prop [S20].
6. Do use InstancedMesh for anything repeated more than 8 times [S29].
7. Do merge static scenery per spatial chunk and per material [S12].
8. Do match fog colour to the sky horizon colour [S15].
9. Do cap DPR and use adaptive resolution.
10. Do use Lambert as the default material [S27].
11. Do fake expensive effects (god rays, glows, vignette, tilt-shift edges) with cheap geometry or CSS.
12. Do vary scale, rotation, tilt and tint on every repeated prop.
13. Do add story props and wear around each interaction spot.
14. Do give interaction spots the highest contrast and a pulsing ring.
15. Do test on a real phone every week, including a 10 minute thermal soak.

### Do not

1. Do not use pure black or pure white anywhere (darkest #2B2438, brightest #FFF2DC).
2. Do not use a neutral grey ambient light.
3. Do not mix flat and smooth shading arbitrarily across similar objects.
4. Do not use more than one shadow-casting light or shadow maps above 2048 on phones.
5. Do not rely on real-time point lights for lamps.
6. Do not place objects at perfect right angles and exact scale repeats.
7. Do not float objects with no ground contact shadow.
8. Do not use MeshStandardMaterial everywhere [S27].
9. Do not enable bloom, SSAO, DoF and outline passes together on phones [S2].
10. Do not let UI buttons be smaller than 44 CSS px.
11. Do not use detailed textures that clash with flat shading.
12. Do not create geometry per frame, call `new Vector3` in the hot loop, or leave unused materials undisposed.
13. Do not place the character above the screen centre in portrait; the thumb and look-ahead need room.
14. Do not use saturated full-brightness greens for grass.
15. Do not forget `renderer.compile` warm-up; first-frame hitches kill the first impression.

---

## 11. The pro checklist: top 25 things that separate amateur from professional low poly

1. Strong silhouettes that read in black.
2. A locked palette of 24 to 32 colours, not "any colour".
3. Hue-shifted ramps instead of brightness-only ramps [S8].
4. Value structure that passes the greyscale test.
5. One clear light direction and one consistent shadow colour.
6. Tinted (never black) shadows.
7. Rim light separating the hero from the background.
8. Baked AO or ground-contact darkening on every prop [S20].
9. Gradient sky matched to fog [S15].
10. Atmospheric perspective: layers fading in value and saturation.
11. Consistent facet density and texel/colour density across assets.
12. Variation: scale, rotation, tilt, tint on repeated objects.
13. Hierarchy of shapes (big, medium, small) within each prop.
14. Bevels or slightly rounded edges that catch the key light.
15. No floating objects; every prop touches the ground with a soft contact.
16. Intentional negative space and a clear walkable read.
17. Storytelling clutter placed in believable clusters.
18. Restrained post-processing: gentle bloom only on emissives, subtle vignette.
19. Emissives that actually glow (and nothing else does).
20. Character with exaggerated proportions and a clean, readable silhouette in motion.
21. Animation with anticipation, overshoot and secondary motion [S25].
22. Foot-sliding-free locomotion, with phase driven by velocity.
23. Smooth camera: damped follow, look-ahead, no jitter, stable shadows (texel snapping).
24. Performance headroom: stable frame time, adaptive resolution, no hitches.
25. Polish layer: tap feedback, haptics, sound sync, loading warm-up, UI that matches the palette.

---

## 12. Sources

Fetched or seen in search summaries during this study (URLs as returned by the tools):

- [S1] three.js performance roundups (draw calls under 100, InstancedMesh, merged geometry, BatchedMesh r159+): https://smithery.ai/skills/Bbeierle12/r3f-performance and https://digitalstrategyforce.com/journal/how-do-you-optimize-threejs-performance-for-mobile-devices/ (search summary only; page blocked)
- [S2] Bloom parameter ranges and mobile cost notes: https://skills.cat/skills/bbeierle12/skill-mcp-claude/postfx-bloom and https://discourse.threejs.org/t/unreal-bloom-optimize/35476 (search summaries)
- [S3] Alto's Odyssey art direction: https://blogs.ulster.ac.uk/cormacmccann/?p=794 and https://www.dice.com/career-advice/altos-odyssey-winning-mobile-game (search summaries)
- [S5] Monument Valley: https://www.creativebloq.com/computer-arts/making-monument-valley-71412213 and https://www.pocketgamer.biz/stairway-to-heaven-the-making-of-monument-valley (search summaries)
- [S7] Flat shading and vertex colours: https://code.tutsplus.com/go-beyond-retro-pixel-art-with-flat-shaded-3d-in-unity--gamedev-12259a
- [S8] Hue shifting: https://pixnote.net/en/learn/shading and https://www.wayline.io/learn/color-palettes/2
- [S9] Kenney style summary: https://kenney.itch.io/kenney-game-assets and https://worldengen.masterpiecex.com/docs/style-guide-templates
- [S10] Chibi proportions: https://tips.clip-studio.com/en-us/articles/4953
- [S11] Quaternius / low poly nature packs poly counts: https://quaternius.itch.io/textured-lowpoly-trees and https://opengameart.org/content/lowpoly-nature-pack
- [S12] BufferGeometryUtils (mergeGeometries, mergeVertices, toCreasedNormals): https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/utils/BufferGeometryUtils.js (read directly)
- [S13] Sunset palettes with hex codes: https://artincontext.org/sunset-color-palette/ and https://60sec.site/color-palettes/golden-hour-glow
- [S14] Vertex colours example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_geometry_colors.html (read directly)
- [S15] Hemisphere light, sky shader and fog example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_lights_hemisphere.html (read directly)
- [S16] Low-poly three.js devlogs and palette-texture pipeline: https://anniecooke.itch.io/uwechristmasgame/devlog/58642/shadows-fog-and-materials and https://bugnet.io/blog/low-poly-3d-a-style-guide-for-small-teams (search summaries)
- [S17] Low-poly tree tutorials: https://www.blendernation.com/2017/06/27/model-low-poly-tree-blender/ and https://apricot.blender.org/tutorial-low-poly-tree-part-1
- [S18] Unreal bloom example (ACES, 0 / 1 / 0.5): https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_postprocessing_unreal_bloom.html (read directly)
- [S19] Shadow camera extents and map size example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_shadowmap_viewer.html (read directly)
- [S20] Baking AO to vertex colours: https://blenderartists.org/t/vertex-oven-bake-ao-to-vertex-colors/1208146 and https://superhivemarket.com/products/vertex-color-octopus
- [S21] UnrealBloomPass source: https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/UnrealBloomPass.js (read directly)
- [S22] Selective bloom example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_postprocessing_unreal_bloom_selective.html (read directly)
- [S23] Tilt-shift shader: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/shaders/HorizontalTiltShiftShader.js (read directly)
- [S24] glTF 4 skin weights per vertex and customisation kits: https://docs.readyplayer.me/ready-player-me/customizing-guides/create-hero-characters
- [S25] Squash and stretch, spring secondary motion: https://www.abratabia.com/game-animation/procedural-animation.php and https://playbooks.com/skills/dylantarre/animation-principles/3d-spatial
- [S26] CCDIKSolver example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_animation_skinning_ik.html (read directly)
- [S27] Lambert vs Standard cost: https://github.com/mrdoob/three.js/issues/18265 and https://www.ui-skills.com/skills/cloudai-x/threejs-materials (search summaries)
- [S28] Toon material gradientMap: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_materials_toon.html (read directly)
- [S29] InstancedMesh example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_instancing_dynamic.html (read directly)
- [S30] EffectComposer with OutputPass: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_postprocessing_afterimage.html (read directly)
- [S31] Inverted hull outline: https://github.com/Delt06/urp-toon-shader/wiki/Outline and https://godotshaders.com/shader/inverted-hull-outline-with-group-merge/
- [S32] OutlinePass parameters: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_postprocessing_outline.html (read directly)
- [S33] three-pathfinding: https://github.com/donmccurdy/three-pathfinding (read directly)
- [S34] nipplejs: https://github.com/yoannmoinet/nipplejs (read directly)
- [S35] Crossy Road: https://www.pocketgamer.biz/making-of-crossy-road/ (search summary)
- [S36] Townscaper / Bad North: https://80.lv/articles/using-wave-function-collapse-algorithm-for-dioramas and https://en.wikipedia.org/wiki/Townscaper (search summaries)

Limitation: many pages were unreachable. Items tagged [Rule] are studio defaults from general industry practice and must be validated by a profile run on target devices before being treated as law.
