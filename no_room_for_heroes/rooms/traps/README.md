# Trap overlays — upload here

One sprite (or animation) per trap, drawn centered in the room with feet on
the floor (~100–110 px tall in-game; export ~256 px tall, transparent PNG).

- Static: `<id>.png`
- Animated: `<id>_0.png`, `<id>_1.png`, … (any count up to 12).
  Order frames RESTING → FULLY EXTENDED (e.g. `spike_0` = retracted,
  last frame = spikes up). The engine plays them synced to the trap firing:
  up fast (~0.11 s), back down slow (~0.48 s), resting on frame 0.

Trap ids: spike flame arrow oil frost tesla magebane maul gallows hexward
bombard venom corrode hexbrand runestone web horn censer

Frames must be contiguous: the loader stops at the first missing index, so a
missing `_05` ends the sequence at `_04` (e.g. `censer_08.png` stays dormant
until `censer_05`..`_07` are uploaded, then plays with no code change).

- `web` (Web Snare) loops continuously at 150 ms/frame (`TRAP_LOOP_MS`).
- `horn` (Wailing Horn) is strike-synced: fast rise to the wail, slow fall.
- `censer` (Confusion Censer) plays FORWARD once per fire (the smoke puff never
  reverses) and rests on frame 01 between puffs.
- These three are exported at 1/2 of the painted size (premultiplied LANCZOS);
  a re-upload should get the same resize (web 668x531, horn 534x435, censer 749x540).
- The rooted-hero web cocoon lives in `../fx/web_root.png`.
