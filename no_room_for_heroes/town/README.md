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

## Building art (`<id>.png`)

Each building draws its own painted sprite from `town/<id>.png` (transparent PNG,
bottom-centred on its plot, ~72px tall in-world, scaling up with level). If a
file is missing, that building falls back to the procedural drawing — so the
set degrades gracefully.

Current art was cut from the three uploaded `buildings_0*.png` sheets (kept in
git history at commit c71afdf, not shipped) and matched to buildings:

| id | building | id | building |
|----|----------|----|----------|
| `guild` | Guild House (red-roof hall) | `treasury` | Treasury ($ banners + gold) |
| `sanctum` | Sorcerer (wizard tower) | `obelisk` | Dread Obelisk (skull monolith) |
| `inn` | The Inn (tavern) | `library` | Dark Library (book manor) |
| `den` | Smugglers (skull-sign house) | `smithy` | Dark Smithy (forge + anvil) |
| `watch` | Watchtower (beacon tower) | `shrine` | Relic Shrine (relic emblem) |
| `quarry` | Quarry & Mill (mine + crystals) | `foundry` | War Foundry (twin-tower forge) |
| `vault` | The Vault (golden dial) | | |

To swap any building's art, just replace its `town/<id>.png`.

