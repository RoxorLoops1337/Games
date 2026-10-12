# Awesome Farm: Art style and palette

Part of the Awesome Farm notes; the essentials are in [../CLAUDE.md](../CLAUDE.md).

## Art style & palette — the "cozy storybook" look

The canvas is **twice as dense as the layout** (`SS = 2` in `src/client/res.ts`: 1920×1080 pixels for the
960×540 HUD space, world camera zoom `ZOOM × SS`). Everything in game logic and UI layout stays in logical
units; only art, text and the HUD camera know about `SS`. Use `hudCamera()` for a scene that draws HUD-space
objects, `logical(pointer)` to read the pointer in HUD units, and give new text `resolution: SS` (`label()`
does it for you).

- **Painted sprites** (`src/client/art/storybook*.ts`, painter in `paint.ts`): trees, rocks, ores, plants,
  crops, the farmer, buildings, decor, landmarks, creatures, monsters and bosses are painted pixel by pixel on a
  2× grid with `paint()` / `paintFrames()` (`Pix`: shaded ellipses, polygons, blades, then a 1 px outline
  taken from the colour it touches). They register under the *same texture key and logical size* as before
  (`addDense()` sets the frame's logical size), so the game code never changes. Boot paints `ART_GROUPS` one group per task
  (the loading line names each); monsters, bosses, shots and creatures are painted on first use (`ensureMobArt`, `critTex` /
  `ensureCritterArt`: never write a `crit_<species>` key by hand). Light comes from the top
  left; one ramp per material (`RAMP` in `paint.ts`). **Never paint a ground shadow into a sprite** — the game
  puts one under everything that stands.
- **Grid art** (item icons, skill glyphs, factory machines, the odd leftover) is still authored as palette-char
  grids (`pixels.ts`: `makeSprite`), without an outline; it is smoothed with Scale2x and outlined at 2×, so it
  sits beside the painted sprites. Palette chars: the table below (the world and icons use it; painted sprites
  and the UI use the richer ramps in `paint.ts` and `ui/theme.ts`).
- **Ground** (`storybook-ground.ts`): 32×32 tiles in one sheet (deep and shallow water, a cliff per biome, six
  ground variants per biome, rift tiles, and 32 shallow-water-with-foam variants chosen by which sides touch
  land: see `world/tiles.ts`). Ore veins are 27 more frames of the same sheet (after the cave frames), drawn as a second
  TilemapLayer (`world/veins.ts`): one display object however many veins.
- **UI** (`ui/px.ts`, `ui/theme.ts`, `ui/kit.ts`): wood frames, parchment pages, brass studs, a red ribbon for
  window titles. Headings and buttons use Fredoka (`font: 'head'`), body text Jersey 15; dark-theme text colours
  that screens ask for are mapped to ink tones by `onPaper()`. Pass `dark: true` for text on a dark or coloured
  surface, `stroke` for text drawn over the world. Frames that rarely change are baked into a texture
  (`ui/bake.ts`): a Graphics replays every draw command each frame, which is what a phone feels.
- **Motion:** squash & stretch, bobbing and quick pop-ins, always brief and back to rest.
  Rotate only tools, windmill blades and downed farmers.
- **Islands:** flat ground, a one-tile cliff face only on south edges, foam where shallow water meets land,
  deep sea beyond.
- **Dev helpers** (`src/dev/harness.ts`): `__gallery(keys, { zoom, cols, bg })` lays textures out on a meadow
  for looking at art; `__shot(x, y, w, h, zoom)` returns the real canvas as a PNG data URL; `__day(frames)` pins
  midday. `?profile=nat1` is a fresh island, `?profile=art1` a showcase base. `performance.getEntriesByName('art')` and the
  `art:<group>` measures time the boot paint.
- **Generated art:** use the repo's ComfyUI pipeline snapped to our palette:
  `python tools/comfyui/make_sprite.py "<subject>" --name <n> --palette awesome_farm/palette.gpl`.

| char | name | hex | role |
|---|---|---|---|
| `k` | ink | `#2a1d2c` | outlines, eyes, darkest shadow: a warm aubergine, never pure black |
| `n` | night | `#35305c` | night overlay, coal, deep shadow |
| `D` | deepSea | `#2d6ea6` | open water |
| `W` | sea | `#4ab2cf` | shallow water |
| `F` | foam | `#cdf4ee` | foam, sparkles, ice |
| `G` | pine | `#2d6a50` | leaf shadow |
| `g` | leaf | `#5cb04f` | leaves |
| `h` | grass | `#92d364` | meadow ground |
| `l` | lime | `#d4f08a` | leaf/grass highlight, revive |
| `e` | moss | `#6c9a49` | quarry ground |
| `B` | bark | `#6a402f` | dark wood |
| `b` | wood | `#a8703f` | wood, handles |
| `d` | dirt | `#d49a62` | dirt, cliff faces, tilled soil |
| `s` | sand | `#f4deaa` | sand ground, cream shading |
| `c` | cream | `#fff6e0` | Sprout's body, UI panels |
| `r` | berry | `#e85d62` | berries, hearts, danger |
| `o` | pumpkin | `#f8a24a` | pumpkins, fire, rust |
| `y` | gold | `#ffd966` | coins, gold, energy |
| `p` | blossom | `#f79fc6` | flowers, cheeks |
| `v` | plum | `#9d6fdb` | slimes, XP, perks, magic |
| `u` | dusk | `#5d4a7c` | bog ground |
| `S` | slate | `#666b86` | dark stone |
| `t` | stone | `#9ea4b9` | stone |
| `T` | pebble | `#d5d9e6` | stone highlight, iron |
| `w` | snow | `#fffbf4` | snow, white highlights |
