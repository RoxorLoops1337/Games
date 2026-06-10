# Town map backdrop

Drop the AI-generated map background here as **`map_bg.png`** (the 16:9 image
generated from the cover plate of the 960×520 town world — main street along
the bottom, central plaza with the crystal fountain, pond top-right).

Upload via GitHub's **Add file → Upload files** (not as a chat image, which
can't be saved at full quality). Any 16:9 resolution works; 1920×1080 is
plenty. The game stretches it to span the full map width (≈4% — invisible)
and draws the plots, buildings, villagers and labels on top.

While this file is missing the map falls back to the built-in painted terrain,
so nothing breaks either way.

Building art can come next: see `drawTownBuilding` in `index.html` — when you
have per-building images we'll wire them the same way (transparent PNGs,
~500px tall, door facing south, 1–3 level variants).
