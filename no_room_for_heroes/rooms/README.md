# Room art — the standard-room model

Every corridor cell renders **one standard room interior**, and the contents
(traps, monsters, the shop) draw as **separate overlays** inside it.

## The standard room (2 files)

| File | What it is |
|------|------------|
| `rooms/empty.png` | the standard room interior — every cell uses it (~183×192, transparent PNG, bottom sits 12 px below the floor line) |
| `rooms/empty_broken.png` | the same room with the **left doorway smashed open** — shown after a champion crashes through (shake + stones + dust play, then the art switches; patched up between waves) |

(`spike/flame/oil/shop/lair.png` are retired from the renderer — files kept for
reference. To bring per-room interiors back it's a one-line change.)

## Trap overlays (`rooms/traps/<id>.png`)

Each trap is its own sprite drawn centered in the room, feet on the floor
(display height ≈ 100–110 px in a 200 px-wide cell — export ~256 px tall,
transparent). Two options per trap:

- **Static:** upload `rooms/traps/<id>.png`
- **Animated:** upload numbered frames `rooms/traps/<id>_0.png`,
  `<id>_1.png`, … (any count up to 12, probed in order). If frames exist they
  win over the static file.

**How animations play — the strike profile.** Order frames from RESTING
(`_0`, e.g. spikes retracted) to FULLY EXTENDED (last frame, spikes up). The
engine plays them **synced to the trap actually firing**: up FAST (~0.11 s),
back down SLOW (~0.48 s), then resting on frame 0 until the next hit. 4–5
frames is plenty — the engine owns the timing, so no extra frames are needed
for fast-up/slow-down. In the build phase each trap previews its strike every
2.4 s so you see the animation while placing.

Trap ids: `spike flame arrow oil frost tesla magebane maul gallows hexward
bombard venom corrode hexbrand runestone`

**Graceful:** while a trap has no art, its procedural prop keeps drawing — so
you can upgrade traps one file at a time. Upload via GitHub → Add file →
Upload files.

## Candle / torch flames (`rooms/fx/candle_<n>.png`)

Looping flame frames for the standard room's two wall torches. Upload
`rooms/fx/candle_0.png`, `candle_1.png`, … (any count up to 12) — small
transparent frames (~16×24 px, flame only). They loop at ~9 fps, drawn on
both torch sconces of every room, staggered per cell so the dungeon
flickers naturally. While missing, nothing extra draws (the painted flame
on the room art stays). Torch positions are tunable in `CANDLE_POS`.
