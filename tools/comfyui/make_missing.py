#!/usr/bin/env python3
"""
make_missing.py - batch-generate the game's missing trap art in one go.

No Room For Heroes has animated art for 9 of its 15 traps. The remaining 6
(oil, magebane, bombard, corrode, hexbrand, runestone) currently fall back to
crude procedural props. This script renders a clean STATIC sprite for each,
straight into no_room_for_heroes/rooms/traps/<id>.png, where the game's art
loader picks them up automatically (static art shows as-is; the strike
animation just won't play until you make a frame sequence).

It's a thin wrapper over make_sprite.py - same requirements: a reachable local
ComfyUI (this will NOT work from a cloud/web Claude session, whose container
can't reach 127.0.0.1:8000) plus `pip install pillow numpy`.

Usage (from anywhere, on the machine running ComfyUI):
    python tools/comfyui/make_missing.py                # render all 6 missing traps
    python tools/comfyui/make_missing.py --only oil bombard
    python tools/comfyui/make_missing.py --dry-run      # print the commands, render nothing
    python tools/comfyui/make_missing.py --size 128 --host 127.0.0.1:8188

After it finishes, open align.html, position/scale each new trap, and (optionally)
replace the static PNG with a frame sequence (<id>_0.png, _1 ...) to animate it.
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
MAKE = HERE / "make_sprite.py"
TRAPS_DIR = REPO / "no_room_for_heroes" / "rooms" / "traps"

# Shared style cues so new traps match the existing rooms/traps art: full-colour
# (NOT 16-colour) chunky pixel art, weathered dungeon materials, dramatic rim
# light, single apparatus on a transparent (white) background. Passed verbatim
# via --raw-prompt, so each value below must be a full VISUAL description — the
# trap ids (oil, magebane, ...) are invented game terms SDXL doesn't know.
STYLE = ("detailed chunky pixel art, dark medieval dungeon trap prop, weathered "
         "iron wood and stone, dramatic rim lighting, single object centered, "
         "front three-quarter view, plain solid white background")

# id -> VISUAL description (colour-matched to each trap's in-game tint).
MISSING_TRAPS = {
    "oil":       "a spilled black crude-oil slick spreading across cracked dungeon "
                 "stone, a tipped rusted iron barrel leaking glossy black tar, dark greasy puddle",
    "magebane":  "a tall violet anti-magic crystal obelisk on a dark iron stand, "
                 "glowing purple amethyst shards crackling with arcane sparks",
    "bombard":   "a squat black iron mortar cannon on a reinforced wooden carriage, "
                 "wide upward-angled barrel, a glowing fused iron bombshell, wisps of smoke",
    "corrode":   "a brass and copper acid-sprayer nozzle on rusted corroded pipework, "
                 "dripping glowing toxic-green acid, pitted bubbling metal",
    "hexbrand":  "a glowing red-hot iron branding rod resting in a small iron brazier "
                 "of embers, the brand tip a burning crimson hex sigil",
    "runestone": "a tall ancient grey standing-stone monolith carved with glowing "
                 "purple arcane runes, weathered cracked rock, faint violet aura",
}


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="+", metavar="ID",
                    help="render only these trap ids (default: all missing)")
    ap.add_argument("--size", type=int, default=256,
                    help="sprite size px (default 256 — existing trap art is high-res, not tiny)")
    ap.add_argument("--host", default="127.0.0.1:8000", help="ComfyUI address")
    ap.add_argument("--palette", default="none", help="passed through to make_sprite")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the make_sprite commands without rendering")
    args = ap.parse_args()

    ids = args.only or list(MISSING_TRAPS)
    unknown = [i for i in ids if i not in MISSING_TRAPS]
    if unknown:
        sys.exit(f"Unknown trap id(s): {', '.join(unknown)}. "
                 f"Known: {', '.join(MISSING_TRAPS)}")

    jobs = []
    for tid in ids:
        out_path = TRAPS_DIR / f"{tid}.png"
        prompt = f"{MISSING_TRAPS[tid]}, {STYLE}"
        cmd = [sys.executable, str(MAKE), prompt, "--raw-prompt",
               "--name", tid, "--size", str(args.size),
               "--palette", args.palette, "--host", args.host,
               "--out", str(TRAPS_DIR)]
        jobs.append((tid, out_path, cmd))

    print(f"[make_missing] {len(jobs)} trap(s) -> {TRAPS_DIR}")
    if args.dry_run:
        for tid, out_path, cmd in jobs:
            print(f"\n# {tid} -> {out_path}")
            print("  " + " ".join(repr(c) if " " in c else c for c in cmd))
        print("\n(dry run: nothing rendered)")
        return

    TRAPS_DIR.mkdir(parents=True, exist_ok=True)
    failed = []
    for tid, out_path, cmd in jobs:
        print(f"\n=== {tid} ===")
        if subprocess.run(cmd).returncode != 0:
            failed.append(tid)
            print(f"[make_missing] {tid} FAILED")
        else:
            print(f"[make_missing] {tid} -> {out_path}")

    done = [t for t in ids if t not in failed]
    print(f"\n[make_missing] done: {len(done)}/{len(ids)} "
          f"({', '.join(done) or 'none'})")
    if failed:
        print(f"[make_missing] failed: {', '.join(failed)} "
              f"(run `python tools/comfyui/make_sprite.py --check` to diagnose)")
        sys.exit(1)
    print("Next: align each new trap in align.html; optionally swap the static "
          "PNG for a frame sequence (<id>_0.png, _1 ...) to animate it.")


if __name__ == "__main__":
    main()
