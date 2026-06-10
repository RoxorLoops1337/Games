# Super Rogue — champion sprite (rogue-class mini-boss)

The big "Super Rogue" — the empowered rogue champion, the rogue's answer to the
Super Knight (`sprites/champion/`). She arrives ALONE as a dramatic mini-boss
and should read clearly **BIGGER** than a normal hero.

Drop the frames here via GitHub's **Add file → Upload files** (not as chat
images) — transparent background, no baked shadow, **right-facing** (heroes
march rightward).

Folder layout (any filenames are fine — they'll be normalised):
- walk frames (e.g. `rogue_walk_0.png …`) — frame 0 is the neutral idle stance
- attack animation 1 → put in `attack1/`
- attack animation 2 → put in `attack2/`

Rules that matter (same as the Super Knight):
- **Within one animation**: every frame on the same canvas size, feet on the
  same baseline, body at the same scale — otherwise the character jitters.
- **Between animations**: canvas sizes may differ freely; the engine sets a
  per-clip draw height (content-matched, like the Super Knight's walk vs
  attack). Just keep the CHARACTER the same size and footing across them.
- **Champion scale** — noticeably bigger than a normal hero (the Super Knight
  draws ~88px tall walking / ~99px attacking, towering over the 150px rooms).

When the frames land, note (or I'll measure): frame counts per animation and
which frame is the hit/impact moment. The two attack animations will alternate
per swing, and the walk/attack clips wire into `drawChampion` the same way the
Super Knight's do.
