# Golden-Hour Park: Palette, Camera, Light and Budgets (one page)

All numbers are starting values. Items from direct three.js example code: bloom defaults 0 / 1 / 0.5 and ACES, shadow map 1024 with +/-15 extents, hemisphere light with blue sky and warm ground, tilt-shift defaults h=1/512 and r=0.35. Everything else is a studio rule of thumb to validate on device.

## 1. Palette (hex, grouped by role)

Darkest allowed: #2B2438. Brightest allowed: #FFF2DC. No pure black or white.

| Role | Shadow | Base | Light | Glint |
|---|---|---|---|---|
| Sky (top to horizon) | zenith #4E5F9E | upper #8C7BB0 | mid #F2A38A | horizon #FFD08A |
| Sun and haze | sun halo #FFB067 | sun disc #FFE2A8 | fog / horizon haze #F0B79A | rim light #FF8FB0 |
| Grass | #2F5D5A (teal shade) | #7FA84A | #B7C95A | #E4E58A |
| Tree canopy (broadleaf) | #2F5D5A | #3F7D4E | #8FB04F | #D9B94A (backlit) |
| Blossom / autumn accent | #8E3F5E | #E0703A | #F2A0B8 | #FFD2A0 |
| Trunk and wood | #4B3547 | #7A5238 | #A66B3F | #C98F5F |
| Path (sand and paving) | #A0705A | #C99A78 | #E9C9A0 | #F6E2BC |
| Stone and rock | #5D5470 | #8D8397 | #B9AFB8 | #DDD5DD |
| Brick wall | #8E3F3B | #B5573F | #D9825F | mortar #D9B79E |
| Water | #2C6E8F | #4FB6C9 | #8FE0E0 | foam #F4F1E6 |
| Metal (lamps, bench legs, bins) | #2B2438 | #3A3A4F | #5E5E7A | #9A9AB8 |
| Far skyline layers | | near #8F7AA8 | mid #B995B5 | far #F0B79A |
| Clouds | underside #C98BA8 | #E8A9A0 | #FFD7B8 | rim #FFF2DC |

Accents (use under 10 percent of screen):

- Graffiti and mural: magenta #FF4F8B, teal #29D3C7, yellow #FFD23F, violet #7B5CFF, off-white #FFF2DC, ink #2B2438
- Neon and lamp glow: warm lamp #FFC46B, neon pink #FF3D9A, neon cyan #35F2E0
- Interaction ring and prompt: #35F2E0 (idle), #FFD23F (active), #FF3D9A (new or unlocked)
- Shadow tint for AO and shadows: #5A4B8A (violet), blob shadow #3B2F55 at 25 percent alpha
- Skin tones (8 presets): #FBE0C8, #F6D1B1, #E8B58E, #D9A07A, #C98B5E, #A8683F, #8A5030, #6B4026
- Outfit swatches (12): #FF4F8B, #FF8A3D, #FFD23F, #8FD14F, #29D3C7, #4FA3FF, #7B5CFF, #C77DFF, #E8E1D5, #3A3A4F, #B5573F, #2F5D5A
- UI text on world: #2B2438 on #FFF2DC panels, 90 percent opacity

Sunset anchors from palette sources: peach #FFDAB9, lavender #E6E6FA, orange #ec7825, champagne #fecd82, dark sky blue #80bddd.

## 2. Camera

| Setting | Value |
|---|---|
| Projection | Perspective, vertical FOV 32 deg (range 30 to 38) |
| Pitch | 45 deg down (range 40 to 50) |
| Yaw | 40 deg fixed (optional +/-20 deg drag) |
| Distance to target | 18 units (range 16 to 22), keep horizontal view at least 12 units wide in portrait |
| near / far | 0.5 / 150 |
| Character screen position | 40 to 45 percent from bottom |
| Follow | position lerp factor 1 - exp(-5 dt), look-ahead 1.5 units, dead zone 0.5 |
| Interaction zoom | distance or FOV 20 percent in over 0.6 s easeInOutCubic |
| Orthographic alternative | frustum height 14 units, same pitch and yaw, no fog depth cue |

## 3. Lights and render settings

| Item | Value |
|---|---|
| Key DirectionalLight | colour #FFC783, intensity 2.8, elevation 18 deg, azimuth 35 deg off camera view, the only shadow caster |
| Hemisphere | sky #9FB4E8, ground #B9794F, intensity 1.0 |
| Rim DirectionalLight | colour #FF8FB0, intensity 1.0, elevation 15 deg, opposite the key, no shadow |
| Ambient | none |
| Tone mapping | ACESFilmic, exposure 1.0 (0.9 to 1.1) |
| Output | SRGBColorSpace |
| Shadow map | 1024 (2048 on tier A only), PCFSoftShadowMap |
| Shadow camera | ortho +/-14 units around the player, near 1, far 60, snapped to texel |
| Shadow bias / normalBias | -0.0005 / 0.02 |
| Fog | Linear, colour #F0B79A, near 25, far 90 |
| Bloom (tier A, half res) | threshold 0.85, strength 0.6, radius 0.4 |
| Tilt-shift (tier A) | focus line r 0.5, h about 1.5 / viewport width, two passes at half res; else CSS gradient edges |
| Vignette | CSS radial gradient, rgba(60,30,80,0.35) at corners |
| DPR cap | tier A 2.0, tier B 1.5, tier C 1.0 to 1.25, adaptive step 0.25 |
| God rays | 4 to 8 additive quads, opacity 0.06 to 0.12, depthWrite false |

## 4. Triangle budgets (per asset, mobile)

| Asset | Tris |
|---|---|
| Hero character (with hair and hat) | 600 to 1200 |
| NPC | 400 to 800 |
| Hair piece / hat | 40 to 120 |
| Large tree | 150 to 400 (oak 250 to 450) |
| Pine | 100 to 180 |
| Bush / small tree | 40 to 120 |
| Grass tuft (instanced) | 6 to 9 |
| Rock | 20 to 60 |
| Bench | 80 to 160 |
| Lamp post | 60 to 140 |
| Fence picket (instanced) | 12 |
| Hero fountain | 600 to 1500 |
| Interaction spot prop | 300 to 800 |
| Background building block | 12 to 60 |
| Ground plane | about 3000 |

Frame totals (visible triangles): tier A 200k, tier B 100k to 150k, tier C 50k.

## 5. Draw-call budget (tier B target 60 to 90, hard cap 100)

| Group | Calls |
|---|---|
| Merged static scenery chunks (20 to 40 chunks, culled) | 15 to 25 visible |
| Instanced sets (trees, grass, flowers, fence, lamps, pavers, windows) | 8 to 12 |
| Ground, path, water | 3 to 5 |
| Mural and decals | 2 to 4 |
| Skydome, sun, clouds, skyline layers | 6 to 8 |
| Hero character (merged by material, plus outline hull) | 6 to 10 |
| NPCs (about 4 to 6 visible, shared materials) | 8 to 12 |
| Shadow pass (casters merged or instanced) | 10 to 20 |
| Glow cards, god rays, particles | 4 to 6 |
| Post (tier A only: bloom about 12 internal passes, tilt-shift 2) | 0 to 14 |

Other budgets: textures under 40 MB (palette 128x128, mural 512x256 or 1024x512, UI atlas 1024), one shadow-casting light, 0 to 2 point lights, transparent coverage under 1.5x screen, first frame after load under 3 s with `renderer.compile` warm-up, target frame time 16.6 ms (tier B 20 ms tolerated), 10 minute soak without dropping below 30 FPS.

## 6. Quality tiers

- Tier A (recent iPhone, flagship Android): DPR 2, shadows 2048, bloom plus tilt-shift, 3000 grass instances.
- Tier B (mid-range, default): DPR 1.5, shadows 1024, no composer, additive glow cards, 2000 grass instances.
- Tier C (budget): DPR 1 to 1.25, shadows 512 or blob only, 800 grass instances, 30 FPS cap.
