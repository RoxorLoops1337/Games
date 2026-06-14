---
description: Generate a pixel-art sprite from the local ComfyUI into this repo's assets/
---

Generate a game-ready pixel-art sprite using the local ComfyUI asset bridge.

The user's request: $ARGUMENTS

Do this:

1. From the user's request, write a clean, descriptive subject prompt and pick a short
   lowercase `--name` (e.g. "treasure chest" -> name `chest`). If they mention a size
   (e.g. 48, 96) pass `--size`; otherwise default 64. The script automatically appends
   pixel-art style cues, so the prompt should just describe the subject.

2. Run, from the repo root:

   ```
   python tools/comfyui/make_sprite.py "<subject prompt>" --name <name> --size <size>
   ```

3. When it prints `DONE -> assets/<name>.png`, tell the user the sprite is ready at that
   path. The render takes ~35s.

If it errors:
- "Could not reach ComfyUI" -> ComfyUI isn't running. Ask the user to open it.
- "HTTP 403" -> their ComfyUI build blocks local API clients; point them to
  `tools/comfyui/README.md` (Fallback section).
- "No SDXL checkpoint / LoRA found" -> run `python tools/comfyui/make_sprite.py --check`
  and relay what's missing.
