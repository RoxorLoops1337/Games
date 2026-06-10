# Title screen art

Drop two PNGs in this folder and the cinematic title screen lights up
automatically (no code change needed — the game looks for these exact names):

| File                          | What it is                                  | Recommended size |
|-------------------------------|---------------------------------------------|------------------|
| `no_room_for_heroes/title/bg.png`   | Full-screen background art (the dungeon scene) | 16:9, e.g. 1536×864 or larger |
| `no_room_for_heroes/title/logo.png` | The logo, **transparent background** (PNG with alpha) | ~1300×900, trimmed to the art |

Behaviour:
- `bg.png` is drawn edge-to-edge with `cover` scaling (centered, no stretch).
- `logo.png` **flies in twirling, SNES-style** (drops from the top, spins 3×,
  overshoots, settles), then a red **▶ Start Game** button fades in at the bottom.
- Both files are **optional**: if `logo.png` is missing the game shows a pixel-font
  text title instead; if `bg.png` is missing it shows a painted purple gradient.
  So the screen always works — uploading the art just makes it gorgeous.

The logo is rendered with `image-rendering:pixelated`, so export it at the size
you want it sharp — a crisp pixel-art PNG will stay crisp.
