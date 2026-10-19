# Midnight Mog Style Bible: "Midnight Neon Baroque"

Ink-black rooftop city, hot neon, ornate cat-shrine UI. Everything is procedural canvas. Import colours from `js/palette.js`; never hard-code hex outside it.

## 1. Identity in one line
Sharp crescent ears, glowing eyes, cyan rim light on every sprite, halftone shadows, and baroque filigree frames that get richer as rarity climbs. If a thing has no rim light and no glow, it is not finished.

## 2. Palette (exact hex, see `PAL`)
| Role | Name | Hex |
|---|---|---|
| Background | ink / void | #0b0716 / #05030c |
| Panels | ink2 / ink3 | #150c28 / #21123d |
| Shadow mid | violet | #5b2a86 (hi #8a4bd1) |
| Danger, enemy, CTA, bounce light | hot magenta | #ff2e88 |
| Heal, success, energy gain | acid lime | #b6ff2e |
| Rim light, mana, focus, player side | electric cyan | #19e6ff |
| Text, eye catch-light | bone | #f4ecff (dim #b9a9d6) |
| Rarity and best loot ONLY | gold | #ffc83d (deep #a9701a, hot #fff0a8) |

Gold rule: gold never appears on plain UI, buttons, currency text or cats of lower rarity. Fish and yarn use bone/cyan/magenta. Gems use cyan. Tokens use lime. Only Legend/Mythic items, crate reveals and "best loot" flashes are gold.

City sky gradient (top to bottom): `PAL.sky` = void, ink2, #3b1466, #8a2a8f, magenta horizon.

## 3. Rarity ramps and ornament tiers (`RARITY`)
Each entry: `{name, color, glow, ramp[5 dark..light], ornament, glowAlpha, stars}`.
| Rarity | Colour | Ornament tier | Look |
|---|---|---|---|
| common | #8f84a8 slate | `plain` | thin 2px frame, no glow |
| rare | #19e6ff | `corners` | cyan frame, 4 diamond corner studs, faint glow |
| epic | #ff2e88 | `filigree` | magenta frame, curled filigree on all corners and mid-edges, pulse glow 0.5 |
| legend | #ffc83d | `crown` | gold double frame, crown spikes on top edge, sparkle motes, glow 0.7 |
| mythic | prismatic | `halo` | hue-cycling `prism(time)` frame, rotating halo ring behind art, orbiting stars, lens flare cross, glow 0.9 |

Stars shown on cards: common 1 to mythic 5. Sample a ramp with `ramp(id, t)`; mythic loops with time.

## 4. Role colours (`ROLE_COLOR`)
brawler #ff7a2e, archer #19e6ff, mage #c46bff, support #b6ff2e, trapper #ff2e88, tank #5aa2ff. Used for the role chip, ground ring, eye colour and ability glow.

## 5. Shape language
- Signature: **crescent ears**. Every cat ear is a curved sickle triangle (two quadratic curves meeting at a sharp tip, tip leans outward). Enemies use **notched/jagged** shapes instead (zigzag edges, square teeth). Rule: cats curve, enemies cut.
- Cats: round heads, pointed ears, almond eyes. Enemies: angular, asymmetric, dripping neon.
- Buildings: stepped baroque rooftops, arched windows, finials, water towers, antennae.
- UI: chamfered rectangles (cut corners, 6px), never plain rounded boxes. Ornaments are mirrored.

## 6. One outline rule
Every sprite and panel gets a **2px ink (#0b0716) outer outline** (scaled by `u = size/32`, min 1.5px), drawn first by stroking the silhouette with `lineJoin='round'`. No coloured outlines. Inner detail uses 1px darker-shade lines (`shade(c,-0.45)`), never pure black.

## 7. One lighting rule
- **Cyan rim from the upper left** on player-side things: a 1.5u stroke of `PAL.cyan` at alpha 0.85 along the upper-left silhouette edge, plus a 1u bone hot spot on the highest point.
- **Magenta bounce from below** (the city glows): a 1.5u magenta band at alpha 0.5 along the bottom edge, clipped to the silhouette.
- Enemies swap: **magenta rim from the upper right**, lime/cyan bounce from below.
- Fill: 3 tones only: base, shade(-0.35) shadow, shade(+0.25) light. Shadow side is lower right (player) so it faces away from rim.
- Ground contact: an ellipse shadow of `rgba(ink,0.55)` plus a colour ring in the unit's role/faction colour at alpha 0.35.

## 8. Procedural texture vocabulary
1. **Halftone shadow**: grid of dots (spacing 3u, rotated 45deg), radius scales 0 to 1.1u with darkness, colour `shade(base,-0.5)`; clip to silhouette. Cache per sprite in an offscreen canvas.
2. **Scanline grain**: 1px lines every 3px at alpha 0.06 over the whole frame (screen overlay), plus 2% noise dots from a seeded rng (never Math.random in sim; in render use a cheap hash of x,y).
3. **Neon bloom**: three layered strokes, widths 6u/3u/1u at alpha 0.12/0.3/1.0 using `globalCompositeOperation='lighter'`. Or `glow()` for round things.
4. **Window lights**: city buildings carry a grid of tiny rects, ~30% lit in magenta/cyan/bone, a few flicker (hash(time*2)).
5. **Filigree**: mirrored quadratic spirals, 1u line, ending in a dot. Reuse one path function.
6. **Grime/cracks** on enemies: 2 to 3 jagged 1px polylines in shade(-0.5).
7. **Vignette**: radial ink gradient, 0.55 alpha at screen edges, on every screen.

Budget: bake static layers (city backdrop, frames, sprite bodies per level/facing) to offscreen canvases; per frame draw only animated parts (eyes, tail, glow).

## 9. Typography (canvas)
Use `font(size, weight, kind)` from palette.js. Display (Impact stack) for titles, damage numbers, buttons, always UPPERCASE with 0.06em tracking and a 3px ink stroke under the fill. Body (Trebuchet stack) for descriptions, min 13px mobile, bone on ink, boneDim for secondary. Mono for numbers in tables. Titles may carry a 2-stop vertical gradient (bone to cyan) and a neon bloom. Damage numbers: bone normal, cyan crit with larger size and "!" , lime heal with "+". Never gold text except rarity names of legend/mythic. No em dashes in any string.

## 10. UI frames and ornaments
- **Panel**: ink2 fill, 2px frame in a rarity colour (neutral = violet), 6px chamfered corners, inner 1px line at +4px inset in `rgba(bone,0.08)`, top-left cyan highlight line.
- **Button**: chamfered, vertical gradient shade(+0.15) to shade(-0.2), 3px ink outline, 2px bone top inner highlight, pressed = shift 2px down and drop bloom. Primary = magenta, positive = lime, neutral = violet. Min 44px tall.
- **Card**: 5:7 ratio, art window top 55%, cost gem top-left (cyan circle, bone number), rarity ornament per section 3, name banner mid, text bottom, type glyph top-right.
- **Bars**: HP = magenta over hpBack with a bright 1px top line; energy = cyan pips, filled pip glows; progress = lime.
- **Ornament functions** (render/ui helpers should offer): `cornerStud`, `filigreeCorner`, `crownEdge`, `haloRing`. Each takes (ctx, x, y, size, color, t).

## 11. Cat construction from primitives
Unit size `u = h/32`. Draw order, back to front:
1. Ground shadow + role ring.
2. **Tail**: 6-segment curve from rump, sinusoidal sway `sin(t*3+phase)*0.35`, width tapering 3u to 1u, tip tinted by role colour; neon tail ring for rare+.
3. **Body**: bean/ellipse 16u x 13u, 3-tone fill, halftone on lower right.
4. **Back legs, front legs**: short rounded rects 4u x 6u, paws are bone-tinted ellipses.
5. **Head**: circle r=8u sitting on body front, slight squash on landing.
6. **Ears**: two crescent paths, inner ear in magenta at alpha 0.7; ears flick back on hit.
7. **Eyes**: almond shape, filled with role colour, vertical slit pupil in ink, 1u bone catch-light top-left, `glow()` r=5u. Blink every 3 to 5s (hash-seeded) for 0.12s.
8. **Nose/mouth**: 1u magenta triangle, tiny w mouth in 1px ink.
9. Rim light and bounce light (section 7), then outline pass first-in-order (outline is stroked behind everything).

Per-role silhouettes (readable at 24px):
- **Brawler**: wide shoulders, spiked collar, bandaged paws, stubby ears; role orange.
- **Archer**: slim, long ears, hooded scarf trailing in the wind, bow arc with cyan string.
- **Mage**: tall pointed hat between the ears, floating orb orbiting head, star-dust trail.
- **Support**: round and fluffy (bigger head 9u), lime heart/halo mark on chest, bell collar.
- **Trapper**: low crouch, goggles on forehead, utility belt with lit pouches, long tail.
- **Tank**: biggest (scale 1.25), plated shoulder pads and helmet with ears poking through, shield edge on the front side.

Rarity ornaments on cats: common none; rare tail ring; epic + collar jewel and trailing sparkle; legend + gold crown/halo mote ring and aura glow; mythic + prismatic aura, orbiting stars, afterimage.

## 12. Enemies
Angular, asymmetric silhouettes, magenta rim from the upper right, eyes as hot slits (faction colour from `ENEMY_COLOR`), dripping neon from the lower edge, jagged grime. Bosses are 2x scale with a floating crown of spikes and a pulsing aura. Flyers have a soft ground shadow far below.

## 13. Animation principles
- **Squash and stretch**: idle breathe 1.5% y-scale at 1.2Hz; jump/land 15% squash for 0.1s; attack stretch 12% forward.
- **Anticipation**: 0.12s pull-back (scale 0.92, lean away) before every attack and spell.
- **Hit flash, 3 frames**: frame 1 pure bone silhouette, frame 2 magenta (enemy) or cyan (cat) tint at 0.6, frame 3 normal plus 2px knockback. Total 0.1s at 30Hz sim time.
- **Death**: pop scale 1.15, flash, burst of 8 to 14 particles in the unit colour, ink smoke ring, fade 0.25s. Enemies drop a rising coin/fish with a bone sparkle.
- **Easing**: outBack for pops, outCubic for slides, inOutSine for loops. Nothing moves linearly except projectiles.
- **Screen**: shake 3px on base hit, 1px on crit, chromatic split (cyan/magenta offset 2px, additive) for 0.15s on boss spawn and crate reveals.
- **Crate reveal**: anticipation shake, white flash, rarity-colour light burst scaled by tier, mythic adds prism rays and slow motion 0.3s.
- Reduced motion setting: drop shake, chromatic split and halo spin.

## 14. Do and don't
Do: ink outline, rim light, glow on eyes, mirrored ornaments, bake static layers, keep 3 fill tones, use role colour consistently, keep contrast at least 4.5:1 for text (bone on ink).
Don't: use gold outside rarity, use pure black or pure white fills (use ink and bone), add a fourth neon hue to one sprite (max 2 neons plus rim), use rounded-pill buttons, draw text without ink stroke over art, use Math.random in sim, allocate gradients per frame in hot loops (cache them), write em dashes.
