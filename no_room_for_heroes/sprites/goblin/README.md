# Goblin sprite sheets (monster)

Drop the goblin sprite-sheet PNG(s) here. Upload via GitHub's
"Add file → Upload files" (not as a chat image) so transparency is preserved.
Export WITHOUT a baked-in shadow — the engine draws the shadow.

Any filenames are fine (capitals/spaces ok) — I'll normalise them to
goblin_<clip>.png. Helpful to note (here or in a small atlas .json/.txt):
- frame size (e.g. 64x64 or 192x192) and grid (cols x rows)
- which rows/ranges are which animation (idle / walk / attack / hurt / death)
- frame count + FPS per animation
- a single "universal" LPC sheet is fine too — I can slice it.

Note: the goblin is a MONSTER (it guards a room), so it'll mostly use idle +
attack while heroes are in its room, not a walk cycle.
