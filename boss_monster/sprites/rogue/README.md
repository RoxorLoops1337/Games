# Rogue — hero sprite

The Rogue is the last hero class without real art (currently a pixel fallback).
Drop the frames here via GitHub's **Add file → Upload files** (not as chat
images) — transparent background, no baked shadow, **right-facing** (heroes
march rightward).

Folder layout (any filenames are fine — they'll be normalised):
- walk frames (e.g. `rogue_walk_0.png …`)
- attack animation 1 (e.g. `attack1/…` or `rogue_atk1_0.png …`)
- attack animation 2 (e.g. `attack2/…` or `rogue_atk2_0.png …`)
- optional: idle frame(s)

Rules that matter:
- **Within one animation**: every frame on the same canvas size, feet on the
  same baseline, body at the same scale — otherwise the character jitters.
- **Between animations**: canvas sizes may differ freely; the engine sets a
  per-clip draw height (content-matched, like the Super Knight's walk vs
  attack). Just keep the CHARACTER the same size and footing in the art.
- The rogue is a normal-size hero (smaller than the champion) — match the
  knight/wizard's on-screen proportions, not the Super Knight's.

When the frames land, note (or I'll measure): frame counts per animation and
which frame is the hit/impact moment. Both attack animations will be wired to
alternate per swing.
