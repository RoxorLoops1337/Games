# Trap overlays — upload here

One sprite (or animation) per trap, drawn centered in the room with feet on
the floor (~100–110 px tall in-game; export ~256 px tall, transparent PNG).

- Static: `<id>.png`
- Animated: `<id>_0.png`, `<id>_1.png`, … (any count up to 12).
  Order frames RESTING → FULLY EXTENDED (e.g. `spike_0` = retracted,
  last frame = spikes up). The engine plays them synced to the trap firing:
  up fast (~0.11 s), back down slow (~0.48 s), resting on frame 0.

Trap ids: spike flame arrow oil frost tesla magebane maul gallows hexward
bombard venom corrode hexbrand runestone
