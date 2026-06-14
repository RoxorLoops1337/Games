# ComfyUI asset bridge

Generate game-ready pixel-art sprites from your **local** ComfyUI, straight into this
repo's `assets/` folder, driven from Claude Code. Free, offline, no API key.

## What it does

`make_sprite.py` sends a prompt to ComfyUI (SDXL + Pixel Art XL LoRA), waits for the
render, then runs `pixelate.py` (downscale + fixed palette + transparent background) and
writes the finished sprite to `assets/<name>.png`.

## One-time setup

1. ComfyUI must be running locally (default `127.0.0.1:8000`).
2. Install the pixelate dependencies once:
   ```
   pip install pillow numpy
   ```
3. Verify everything:
   ```
   python tools/comfyui/make_sprite.py --check
   ```
   You want to see your SDXL checkpoint, the pixel-art LoRA, and "pixelate deps: OK".

## Use it

From Claude Code, just say it in plain English ("make a treasure chest sprite") or use
the slash command:
```
/sprite a treasure chest
```
Or run directly:
```
python tools/comfyui/make_sprite.py "a health potion, red liquid" --name potion --size 48
```
Output lands in `assets/`. Raw 1024px renders are cached in `tools/comfyui/raw/`
(gitignored).

## Options

`--size 96` (more detail) · `--palette palettes/pico-8.gpl` (stylized 16 colors) ·
`--palette none` (true colors, default) · `--seed 1234` (repeatable) ·
`--raw-prompt` (don't auto-append style cues) · `--out <dir>` (different asset folder).

## Upgrading quality (better models)

The default — **SDXL base 1.0 + Pixel Art XL LoRA** — is solid and verified. If you want
crisper subjects, better prompt adherence, or nicer shading before the pixelate step, the
biggest lever is a better **SDXL base checkpoint**; Pixel Art XL stays as the style LoRA
on top.

Drop any of these `.safetensors` into ComfyUI's `models/checkpoints/` folder and the bridge
will **auto-prefer it** (auto-detect is ranked, so no flag needed; it still falls back to
plain SDXL if absent):

| Checkpoint | Why | Where |
|---|---|---|
| **DreamShaper XL** (Turbo/v2.1) | clean, readable shapes; forgiving prompts | civitai.com → "DreamShaper XL" |
| **Juggernaut XL** | strong detail & lighting, great for props/items | civitai.com → "Juggernaut XL" |
| **ZavyChromaXL** | punchy, stylized colors | civitai.com → "ZavyChromaXL" |
| **Animagine XL** | best for characters/portraits (anime-leaning) | civitai.com → "Animagine XL" |

Each XL checkpoint is ~6.5 GB. To pin one explicitly instead of auto-detect:
```
python tools/comfyui/make_sprite.py "a dragon" --name dragon --checkpoint juggernautXL_v9.safetensors
```

Other quality knobs (no download needed):
- `--steps 40` (more refinement; default 30) · `--cfg 6` (looser, often cleaner for pixel
  art) · `--size 96` (more detail) · `--palette tools/comfyui/palettes/pico-8.gpl` (enforced
  16-color look).
- Any "pixel art" SDXL LoRA works as the style layer — the bridge prefers a filename
  containing `pixel`; pin a specific one with `--lora <file>`.

> Model files live **outside** this repo (in ComfyUI's shared models dir) and are never
> committed; the bridge only references them by name.

## Fallback: if `--check` reports HTTP 403

Some ComfyUI builds (notably Comfy **Desktop**) block API requests from outside their own
app. A local script usually gets through, but if you see 403:

Run a standard ComfyUI (portable or `git` source) pointed at the **same models** so you
don't duplicate downloads. Create `extra_model_paths.yaml` in that ComfyUI with:
```yaml
shared:
    base_path: C:/Users/<you>/ComfyUI-Shared/models
    checkpoints: checkpoints
    loras: loras
    vae: vae
```
Start it with `python main.py --port 8188`, then run the bridge with `--host 127.0.0.1:8188`.
That server accepts local API calls, and the bridge works unchanged.
