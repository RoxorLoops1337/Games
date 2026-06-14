#!/usr/bin/env python3
"""
pixelate.py - turn raw diffusion output into real, game-ready pixel art.

Pipeline (in order):
  1. Background removal  -> clean, hard-edged transparency
  2. Nearest-neighbor / block downscale to true sprite resolution
  3. Palette snap to a fixed Lospec .gpl palette (or median-cut as fallback)
  4. Save as PNG with transparency

This is the step that prevents blurry "fake pixel art": SDXL output is
anti-aliased and high-res; we downscale hard and quantize colors so every
pixel is a real, intentional pixel.

Dependencies: Pillow, numpy  (both pip-installable, no GPU needed)
Optional:     rembg          (better background removal; --bg rembg)

Examples:
  # Basic: 1024px render -> 64x64 sprite, PICO-8 palette, auto bg removal
  python pixelate.py raw/sprite_0001.png assets/sprite.png \
      --size 64 --palette palettes/pico-8.gpl

  # Keep background, no palette (just clean downscale)
  python pixelate.py in.png out.png --size 48 --bg none --palette none

  # Aggressive background key (looser tolerance)
  python pixelate.py in.png out.png --size 64 --bg auto --bg-tolerance 45
"""

import argparse
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit(
        "Missing dependencies. Install with:\n"
        "  pip install pillow numpy\n"
        "(on Windows just run that in your activated env)"
    )


# --------------------------------------------------------------------------
# Palette handling (.gpl = GIMP / Lospec palette format)
# --------------------------------------------------------------------------
def load_gpl_palette(path):
    """Parse a .gpl palette file into a list of (r, g, b) tuples."""
    colors = []
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            # skip header lines, comments, empty lines, and "Name:"/"Columns:" meta
            if not line or line.startswith("#") or line.upper().startswith("GIMP"):
                continue
            if line.lower().startswith(("name:", "columns:")):
                continue
            parts = line.split()
            if len(parts) >= 3 and all(p.lstrip("-").isdigit() for p in parts[:3]):
                r, g, b = (int(parts[0]), int(parts[1]), int(parts[2]))
                colors.append((r, g, b))
    if not colors:
        raise ValueError(f"No colors parsed from palette: {path}")
    return colors


def snap_to_palette(rgb_array, palette):
    """Map every pixel to the nearest palette color (Euclidean RGB distance).

    rgb_array: (H, W, 3) uint8
    palette:   list of (r, g, b)
    """
    pal = np.array(palette, dtype=np.float32)           # (P, 3)
    flat = rgb_array.reshape(-1, 3).astype(np.float32)  # (N, 3)
    # squared distance from each pixel to each palette entry
    # (N, 1, 3) - (1, P, 3) -> (N, P, 3) -> sum -> (N, P)
    dists = ((flat[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2)
    idx = dists.argmin(axis=1)
    snapped = pal[idx].astype(np.uint8)
    return snapped.reshape(rgb_array.shape)


# --------------------------------------------------------------------------
# Background removal
# --------------------------------------------------------------------------
def remove_bg_auto(img, tolerance):
    """Chroma-key style background removal.

    Samples the four corners to estimate the background color, then makes
    every pixel within `tolerance` (RGB distance) of that color transparent.
    Done at full resolution BEFORE downscale so edges stay clean.
    """
    img = img.convert("RGBA")
    arr = np.array(img)
    rgb = arr[:, :, :3].astype(np.int16)

    h, w = arr.shape[:2]
    corners = np.array(
        [
            arr[0, 0, :3],
            arr[0, w - 1, :3],
            arr[h - 1, 0, :3],
            arr[h - 1, w - 1, :3],
        ],
        dtype=np.int16,
    )
    bg = corners.mean(axis=0)

    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    mask = dist <= tolerance
    arr[:, :, 3][mask] = 0
    return Image.fromarray(arr, "RGBA")


def remove_bg_rembg(img):
    """Use the rembg neural model if available (better for complex subjects)."""
    try:
        from rembg import remove
    except ImportError:
        sys.exit(
            "--bg rembg requires the rembg package:\n"
            "  pip install rembg\n"
            "Or use --bg auto (no extra dependency)."
        )
    return remove(img.convert("RGBA"))


# --------------------------------------------------------------------------
# Downscale
# --------------------------------------------------------------------------
def block_downscale(img, target_w, target_h):
    """Downscale to target size using per-block dominant color.

    For anti-aliased diffusion output this beats naive NEAREST: each output
    pixel is the median color of the source block it covers, which kills
    fringe/halo pixels. Alpha is handled separately with a hard threshold so
    edges stay crisp (no semi-transparent pixels).
    """
    img = img.convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]

    out = np.zeros((target_h, target_w, 4), dtype=np.uint8)
    ys = np.linspace(0, h, target_h + 1).astype(int)
    xs = np.linspace(0, w, target_w + 1).astype(int)

    for j in range(target_h):
        for i in range(target_w):
            block = arr[ys[j]:max(ys[j] + 1, ys[j + 1]),
                        xs[i]:max(xs[i] + 1, xs[i + 1])]
            if block.size == 0:
                continue
            alpha = block[:, :, 3]
            opaque = alpha > 127
            if opaque.mean() < 0.5:
                # majority transparent -> this output pixel is transparent
                out[j, i] = (0, 0, 0, 0)
            else:
                # median color of the opaque pixels in the block
                opaque_px = block[opaque][:, :3]
                med = np.median(opaque_px, axis=0).astype(np.uint8)
                out[j, i, :3] = med
                out[j, i, 3] = 255
    return Image.fromarray(out, "RGBA")


def nearest_downscale(img, target_w, target_h):
    """Plain nearest-neighbor downscale + hard alpha threshold."""
    img = img.convert("RGBA")
    small = img.resize((target_w, target_h), Image.NEAREST)
    arr = np.array(small)
    arr[:, :, 3] = np.where(arr[:, :, 3] > 127, 255, 0)
    return Image.fromarray(arr, "RGBA")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="Turn raw diffusion output into game-ready pixel art.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("input", help="Raw input image (PNG/JPG)")
    ap.add_argument("output", help="Output sprite path (PNG)")
    ap.add_argument("--size", type=int, default=64,
                    help="Target sprite size in px (square). Default 64.")
    ap.add_argument("--width", type=int, default=None,
                    help="Target width (overrides --size).")
    ap.add_argument("--height", type=int, default=None,
                    help="Target height (overrides --size).")
    ap.add_argument("--palette", default="none",
                    help="Path to a .gpl palette, or 'none', or 'auto:N' for "
                         "median-cut to N colors (e.g. auto:16).")
    ap.add_argument("--bg", choices=["auto", "none", "rembg"], default="auto",
                    help="Background removal mode. Default auto (corner key).")
    ap.add_argument("--bg-tolerance", type=int, default=30,
                    help="RGB distance tolerance for --bg auto. Default 30.")
    ap.add_argument("--downscale", choices=["block", "nearest"], default="block",
                    help="Downscale method. 'block' (default) is cleaner for "
                         "AA'd renders; 'nearest' is the classic pixel snap.")
    ap.add_argument("--scale", type=int, default=1,
                    help="Upscale the final sprite by this integer factor with "
                         "NEAREST (for previewing). Default 1 (no upscale).")
    args = ap.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)
    if not in_path.exists():
        sys.exit(f"Input not found: {in_path}")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    target_w = args.width or args.size
    target_h = args.height or args.size

    img = Image.open(in_path).convert("RGBA")

    # 1. background removal
    if args.bg == "auto":
        img = remove_bg_auto(img, args.bg_tolerance)
    elif args.bg == "rembg":
        img = remove_bg_rembg(img)
    # "none" -> leave fully opaque

    # 2. downscale
    if args.downscale == "block":
        img = block_downscale(img, target_w, target_h)
    else:
        img = nearest_downscale(img, target_w, target_h)

    # 3. palette snap (opaque pixels only; transparency preserved)
    if args.palette and args.palette.lower() != "none":
        arr = np.array(img)
        rgb = arr[:, :, :3]
        alpha = arr[:, :, 3]

        if args.palette.lower().startswith("auto:"):
            n = int(args.palette.split(":", 1)[1])
            quant = Image.fromarray(rgb).convert("P",
                                                 palette=Image.ADAPTIVE, colors=n)
            rgb = np.array(quant.convert("RGB"))
        else:
            palette = load_gpl_palette(args.palette)
            rgb = snap_to_palette(rgb, palette)

        arr[:, :, :3] = rgb
        arr[:, :, 3] = alpha  # keep the alpha we computed during downscale
        img = Image.fromarray(arr, "RGBA")

    # 4. optional preview upscale
    if args.scale > 1:
        img = img.resize((target_w * args.scale, target_h * args.scale),
                         Image.NEAREST)

    img.save(out_path)
    print(f"OK  {in_path.name} -> {out_path}  "
          f"({target_w}x{target_h}, bg={args.bg}, palette={args.palette})")


if __name__ == "__main__":
    main()
