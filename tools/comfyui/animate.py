#!/usr/bin/env python3
"""
animate.py - turn ONE static sprite into an animated frame sequence / sprite sheet.

This is the CPU companion to make_sprite.py. It does NOT generate art with a
model (no ComfyUI / GPU needed) - it procedurally animates an existing sprite
with motion and light, which is exactly what most trap/prop animations in this
game are: a rest frame and a few displaced/brightened frames the engine cycles.

Modes:
  strike   monotonic vertical lunge 0 -> amplitude (for traps; the game's
           strikeIdx then plays it rise-fast / fall-slow). Good: spike, maul, arrow.
  pulse    loop: gentle zoom + brightness throb. Good: runestone, hexward glow.
  flicker  loop: brightness/alpha jitter. Good: tesla, hex brand, flame-ish.
  bob      loop: soft sine vertical bob. Good: idle props, hovering items.

Output is named to match the game's loader (`<name>_0.png, _1.png, ...`), so the
frames drop straight into e.g. no_room_for_heroes/rooms/traps/ and animate.

Examples:
  python tools/comfyui/animate.py assets/runestone.png --mode pulse --frames 6 \
      --out-dir no_room_for_heroes/rooms/traps --name runestone
  python tools/comfyui/animate.py assets/spike.png --mode strike --frames 5 --sheet
  python tools/comfyui/animate.py in.png --mode flicker --frames 6 --gif preview.gif

Deps: pillow, numpy  (pip install pillow numpy). No GPU, runs anywhere.
"""
import argparse
import math
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageEnhance
except ImportError:
    sys.exit("Missing deps. Run: pip install pillow numpy")


def _brightness(img, factor):
    rgb = img.convert("RGBA")
    a = rgb.getchannel("A")
    out = ImageEnhance.Brightness(rgb.convert("RGB")).enhance(factor).convert("RGBA")
    out.putalpha(a)
    return out


def _shift(img, dx, dy):
    """Translate on a same-size transparent canvas (content may clip at edges)."""
    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))
    canvas.alpha_composite(img, (int(round(dx)), int(round(dy))))
    return canvas


def _zoom(img, factor):
    """Scale about the center, keeping the original canvas size."""
    w, h = img.size
    nw, nh = max(1, int(round(w * factor))), max(1, int(round(h * factor)))
    scaled = img.resize((nw, nh), Image.NEAREST)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((w - nw) // 2, (h - nh) // 2))
    return canvas


def make_frames(img, mode, n, amp):
    img = img.convert("RGBA")
    frames = []
    for k in range(n):
        t = k / max(1, n - 1)          # 0..1 across the sequence
        loop = math.sin(t * math.pi)   # 0..1..0 for looping modes
        if mode == "strike":
            frames.append(_shift(img, 0, -amp * t))           # rest -> lunge up
        elif mode == "bob":
            frames.append(_shift(img, 0, -amp * 0.5 * loop))
        elif mode == "pulse":
            frames.append(_brightness(_zoom(img, 1 + 0.06 * loop), 1 + 0.30 * loop))
        elif mode == "flicker":
            f = 1 + 0.5 * loop * (1 if k % 2 == 0 else 0.4)   # uneven sparkle
            frames.append(_brightness(img, f))
        else:
            sys.exit(f"Unknown mode: {mode}")
    return frames


def save_sheet(frames, path):
    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.alpha_composite(fr, (i * w, 0))
    sheet.save(path)


def save_gif(frames, path, fps, bg="#1b1530"):
    bg_rgb = tuple(int(bg[i:i + 2], 16) for i in (1, 3, 5))
    flat = []
    for fr in frames:
        base = Image.new("RGBA", fr.size, bg_rgb + (255,))
        base.alpha_composite(fr)
        flat.append(base.convert("P", palette=Image.ADAPTIVE))
    flat[0].save(path, save_all=True, append_images=flat[1:],
                 duration=int(1000 / max(1, fps)), loop=0, disposal=2)


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="static sprite PNG (ideally transparent bg)")
    ap.add_argument("--mode", default="pulse",
                    choices=["strike", "pulse", "flicker", "bob"])
    ap.add_argument("--frames", type=int, default=5)
    ap.add_argument("--amp", type=int, default=10,
                    help="motion amplitude in px (strike/bob). Default 10.")
    ap.add_argument("--out-dir", default=None,
                    help="where frames go (default: next to the input)")
    ap.add_argument("--name", default=None,
                    help="frame basename (default: input stem). Frames are <name>_0.png ...")
    ap.add_argument("--sheet", action="store_true",
                    help="also write a horizontal strip <name>_sheet.png")
    ap.add_argument("--gif", default=None, help="also write an animated preview GIF here")
    ap.add_argument("--fps", type=int, default=10, help="GIF frame rate")
    args = ap.parse_args()

    in_path = Path(args.input)
    if not in_path.exists():
        sys.exit(f"Input not found: {in_path}")
    name = args.name or in_path.stem
    out_dir = Path(args.out_dir) if args.out_dir else in_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    frames = make_frames(Image.open(in_path), args.mode, args.frames, args.amp)
    for i, fr in enumerate(frames):
        fr.save(out_dir / f"{name}_{i}.png")
    print(f"[animate] {args.mode}: {len(frames)} frames -> {out_dir}/{name}_0.png ...")
    if args.sheet:
        save_sheet(frames, out_dir / f"{name}_sheet.png")
        print(f"[animate] sheet -> {out_dir}/{name}_sheet.png")
    if args.gif:
        save_gif(frames, args.gif, args.fps)
        print(f"[animate] preview gif -> {args.gif}")


if __name__ == "__main__":
    main()
