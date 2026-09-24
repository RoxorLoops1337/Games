# clawspire/art

Optional illustrated art. Every picture in the game is drawn with canvas code
in `js/render.js`; a PNG placed in this folder at the right path replaces the
matching drawing the next time the game loads. No code change, no build step.
Delete the PNG and the drawn art comes back.

The full list of paths, sizes and ready-to-paste image generator prompts is in
[`../ART_PROMPTS.md`](../ART_PROMPTS.md). The folders:

| Folder / file | What goes there |
| --- | --- |
| `items/<artKey>.png` | one picture per item art key, shared by every item using it |
| `items/id/<itemId>.png` | optional override for a single item (checked first) |
| `enemies/<artKey>.png`, `enemies/<enemyId>.png` | enemies, bosses and elites (the id file wins) |
| `portraits/<charId>.png` | knight, alchemist, rogue |
| `relics/<relicId>.png` | relic emblems |
| `status/<statusId>.png` | status effect glyphs |
| `hex/<tileType>.png` | map tile icons |
| `bg/act1.png` .. `bg/act3.png` | arena backdrops |
| `bg/map1.png` .. `bg/map3.png` | map backdrops |
| `title.png`, `logo.png` | title screen scene and logo |
| `cabinet.png` | frame overlay drawn over the claw machine (transparent window) |
| `claw/palm.png`, `claw/prong.png`, `claw/carriage.png` | claw parts |
| `events/<eventId>.png` | event illustrations |
| `ui/coin.png`, `ui/ink.png`, `ui/brush.png` | small HUD icons |

How it works: `js/art.js` builds the list of every known path from the game
data, `GAME.boot()` calls `ART.load()`, which requests each one; files that are
missing 404 quietly (you will see them in the browser console, that is fine)
and the renderer keeps drawing the vector art for them. PNGs with transparent
backgrounds, please, except the backdrops, title and event scenes.

This folder ships empty on purpose: the game is complete without it.
