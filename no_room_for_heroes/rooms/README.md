# Room art

Corridor-cell interiors, drawn bottom-aligned in each 200-px room cell
(art bottom sits 12 px below the floor line). Current set: `empty`, `spike`,
`flame`, `oil`, `shop`, `lair` — ~183×192 transparent PNGs (match `spike.png`).

## Broken variants (`<k>_broken.png`)

When a **champion** (or the King) marches through a room's doorway, the screen
shakes, stones fly, dust billows — and the cell's art switches to its broken
variant for the rest of the wave:

| Normal | Broken (upload these) |
|--------|----------------------|
| `rooms/empty.png` | `rooms/empty_broken.png` |
| `rooms/spike.png` | `rooms/spike_broken.png` |
| `rooms/flame.png` | `rooms/flame_broken.png` |
| `rooms/oil.png`   | `rooms/oil_broken.png` |
| `rooms/shop.png`  | `rooms/shop_broken.png` |
| `rooms/lair.png`  | `rooms/lair_broken.png` |

Same size/framing as the normal art, with the left doorway smashed open —
crumbled arch, rubble on the floor, cracks. Upload via GitHub → Add file →
Upload files. **Optional & graceful:** while a `_broken.png` is missing, the
smash effects (shake/debris/dust) still play and the normal art stays.
Doorways are patched up automatically between waves.
