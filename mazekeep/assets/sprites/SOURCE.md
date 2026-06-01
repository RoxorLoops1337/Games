# Tower Defense Sprites

The source [`spritesheet.png`](spritesheet.png) sliced into **147 individual,
transparent PNG sprites**, organized by category.

| Category | Count | Contents |
|----------|------:|----------|
| `towers/` | 17 | Archer / Cannon / Magic / Fire / Poison / Ice tower variants |
| `enemies/` | 34 | Skeletons, orcs, goblins, beasts, boss |
| `projectiles/` | 24 | Arrows, magic bolts, fireballs, impacts & explosions |
| `tiles/` | 22 | Path tiles, ground tiles, obstacles (rocks, bushes, trees, logs) |
| `effects/` | 20 | Build, upgrade and sell effects |
| `ui-icons/` | 12 | Coin, gem, play / pause / fast-forward / settings buttons |
| `wave-indicators/` | 4 | Wave 1 / Wave 5 / Boss Wave banners |
| `health-bars/` | 5 | Health bar states |
| `misc/` | 9 | Star, shield, heart, chest, flag, crosshair, badges |

Each sprite is alpha-trimmed to its bounding box. Pixel coordinates back to the
original sheet are recorded in [`sprites.json`](sprites.json).

## Preview

Open [`index.html`](index.html) for a filterable gallery of every sprite.

## Re-slicing

The cuts are produced automatically (background threshold + connected-component
labelling, with grayscale text labels filtered out):

```bash
pip install pillow numpy scipy
python3 slice.py
```

`_overlay.png` shows the detected bounding boxes drawn over the source sheet.
