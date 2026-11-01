# B19: Pawprint (procedural cat sprites)

Files: `src/gfx/pawprint.js` (classic script, `window.SB.gfx.pawprint`, alias `window.Pawprint`), `src/gfx/pawprint-demo.html` (open directly, `?static=1` freezes animation).
Cats are 32x32, face RIGHT, drawn per frame into cached offscreen canvases (nearest neighbor). Deterministic: same genome gives identical pixels.

## Genome (plain object, serializable)
`{seed, body, fur, pattern, patternColor, ears, eyes, eyeColor, tail, accessory, accessoryColor, scale}`
- body: slim tabby chonk large tall kitten floof
- fur: orange black white grey cream chocolate blue ginger gold sphynx
- pattern: solid stripes spots(bengal) tuxedo calico siamese tortie bicolor hairless
- ears: point round fold tufted tiny. eyes: round slit sleepy wide happy. eyeColor: green amber blue copper odd
- tail: long stub fluffy curl ring
- accessory: none collar bell bow bowtie scarf hat_wizard hat_crown hat_party hat_top glasses eyepatch bandana cape armor_helm headphones cardboard_box (cat sits in it) box_head (box worn on head) flower monocle pirate_hat chef_hat sunglasses
- scale 1.25 for champions: grows about the feet so it stays on its slot. `seed` only matters for spots, calico, tortie.

## Making genomes
- `randomGenome(seed, {clan, rarity, body, fur, pattern, accessory})`: clan alley|hearth|moon|mischief|neutral (aliases prowl, nap, cardboard, chaos, yarn); rarity raises accessory odds, `champion` forces scale 1.25 and always an accessory.
- `fromDescriptor("ginger tabby chonk wizard")` or object: words for fur, pattern, body, ears, eyes, tail, accessory ("thin", "fat", "big", "tuxedo", "bengal", "amber eyes", "odd eyes"). Unnamed fur follows the pattern (tuxedo = black, calico = white).
- `register(id, descriptorOrGenome)` then `fromId(id)`: fixed look per champion or card id. Unknown ids fall back to a stable seeded random. Preloaded: `elder_cat`, `champion_sunbeam`, `champion_moonwhisker`.
- `normalize(g)` fills defaults, `genomeKey(g)` is the cache key.

## Drawing
`drawCat(ctx, genome, pose, x, y, scale, tick)`: x,y is top-left of the 32*scale box (feet at y+29*scale, center at x+16*scale). `pose` is a string or `{name, flip, flash, alpha, tint}`.
Pose names: `idle` (animated from tick, 60Hz units: 36 tick bob, seeded blink every 3.5 to 6 s), `attack`, `hurt`, `sleep` (animated Zzz drawn live), `boxed`, `hidden` (closed box, glinting eyes), `dead` (ghost with halo), plus raw frames `idle0 idle1 blink0 blink1 sleep0 sleep1 boxed0 boxed1 hidden0 hidden1`.
- `flash:true` draws the white silhouette (hit flash, cached). `tint:'#hex'` blends 45 percent color. `flip:true` faces left.
- `deathFade(ctx, genome, x, y, scale, t01)`: ghost rises 10 px and dissolves with a Bayer dither as t goes 0 to 1.
- `draw(ctx, genome, pose, x, y, {scale, flip, flash, alpha, tint, tick})`: A08 style wrapper.
- `make(genome)` returns `{genome, frames, key}`; `frames.idle0` etc are lazy cached canvases. `frame(genome, pose)` returns one canvas. `flashFrame(canvas)` returns a white copy.

## Cache
LRU `Map` keyed by `genomeKey#pose[#flash|#tint]`, default max 600 canvases (`setCacheMax`, `clearCache`, `cacheStats`). A frame costs about 0.35 ms to build, so cold start is cheap. Card art: `frame(genome,'idle0')` once and reuse.

## Notes for integrators
- Outline is derived from the fur (or accessory) color, never pure black. Ghost, shadow and outline are baked into frames.
- Dark furs (black) use light rim pixels to stay readable on dark floors; put cats on a floor lighter than #1a1a22.
- Boxed pose and `cardboard_box` accessory both seat the cat in an open box; the engine should dim Hidden cats with `alpha:0.6`.
- Not included: Pestprint (enemies) and icons.
