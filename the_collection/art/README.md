# Card art (owner uploads)

Drop painted card illustrations in this folder and the game uses them
automatically instead of the procedural scenes — no code changes needed.

- **Naming**: `c001.png` … `c100.png` (the card's set number, zero-padded).
- **Size/shape**: anything works (it's cover-fit into the art window);
  ~512×400 landscape looks best.
- Missing files are fine — cards without art fall back to their generated
  scene. Never breaks the game.

## Generating with the local ComfyUI pipeline

From the repo root **on your own machine** (the cloud sessions can't reach
your ComfyUI):

    python tools/comfyui/make_sprite.py "cute shadow-cat creature in moonlit ruins, trading card art" --name c043 --size 96

Get the full card list (id, name, type) to write prompts from — open the
game in a browser console:

    __TC.CORE_SET.map(c => `${c.id}  ${c.name}  (${c.type}, ${c.tier})`).join('\n')

Then move the finished files from `assets/` into this folder.
