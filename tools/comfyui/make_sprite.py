#!/usr/bin/env python3
"""
make_sprite.py - generate a game-ready pixel-art sprite from your local ComfyUI,
straight into this repo's assets/ folder. Built to be driven by Claude Code.

Pipeline: prompt -> ComfyUI (SDXL + Pixel Art XL LoRA) -> pixelate.py -> assets/<name>.png

Usage (run from the repo root):
    python tools/comfyui/make_sprite.py "a treasure chest" --name chest
    python tools/comfyui/make_sprite.py "a health potion, red liquid" --name potion --size 48
    python tools/comfyui/make_sprite.py --check          # verify ComfyUI + models, no render

Common flags:
    --name <str>      output basename (default: derived from the prompt)
    --size <int>      sprite size px, square (default 64)
    --palette <p>     palettes/pico-8.gpl | none | auto:N   (default none = true colors)
    --out <dir>       where finished sprites go (default: ./assets)
    --raw-prompt      use the prompt verbatim (don't auto-append pixel-art style cues)
    --host host:port  ComfyUI address (default 127.0.0.1:8000)
    --seed <int>      fixed seed (default: random)

Requirements on this machine: ComfyUI running, plus `pip install pillow numpy`
(only needed for the pixelate step). No API key, no cloud, no cost.
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORKFLOW = HERE / "workflows" / "pixel_sprite_sdxl.api.json"
RAW_DIR = HERE / "raw"
STYLE_SUFFIX = ", pixel art, white background, full body, centered, game sprite"


def api(host, path, data=None, timeout=600):
    url = f"http://{host}{path}"
    if data is not None:
        data = json.dumps(data).encode()
        req = urllib.request.Request(url, data=data,
                                     headers={"Content-Type": "application/json"})
    else:
        req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def reach(host):
    try:
        api(host, "/system_stats", timeout=10)
        return True, ""
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code} from ComfyUI. If 403, your ComfyUI build blocks " \
                      f"local API clients; see tools/comfyui/README.md for the fallback."
    except Exception as e:
        return False, f"Could not reach ComfyUI at {host} ({e}). Is it running?"


def required_inputs(host, node_class, field):
    try:
        info = api(host, f"/object_info/{node_class}", timeout=20)
        return info[node_class]["input"]["required"][field][0]
    except Exception:
        return []


def autodetect(host, node_class, field, prefer):
    """Pick the best matching option. `prefer` may be a single substring or a
    ranked list of substrings (best first): the first option matching the
    highest-ranked substring wins, so installing a recommended upgrade model
    makes it the automatic default while still falling back to whatever exists."""
    opts = required_inputs(host, node_class, field)
    if not isinstance(opts, list) or not opts:
        return None
    prefs = [prefer] if isinstance(prefer, str) else list(prefer)
    for p in prefs:
        for o in opts:
            if p.lower() in str(o).lower():
                return o
    return opts[0]


# Ranked model preferences (best first). Drop a higher-quality checkpoint/LoRA
# into ComfyUI and it becomes the automatic pick; otherwise we fall back to a
# plain SDXL base + Pixel Art XL. See tools/comfyui/README.md "Upgrading quality".
CKPT_PREFS = ["dreamshaperxl", "juggernautxl", "zavychroma", "animaginexl", "sdxl", "xl"]
LORA_PREFS = ["pixel-art-xl", "pixelartxl", "pixelart", "pixel"]


def do_check(host):
    ok, msg = reach(host)
    if not ok:
        print("CHECK FAILED:", msg)
        return 1
    ckpts = required_inputs(host, "CheckpointLoaderSimple", "ckpt_name")
    loras = required_inputs(host, "LoraLoader", "lora_name")
    ckpt = autodetect(host, "CheckpointLoaderSimple", "ckpt_name", CKPT_PREFS)
    lora = autodetect(host, "LoraLoader", "lora_name", LORA_PREFS)
    print(f"ComfyUI reachable at {host}: OK")
    print(f"  SDXL checkpoint: {ckpt or 'NONE FOUND (install an SDXL checkpoint)'}")
    print(f"  pixel-art LoRA : {lora or 'NONE FOUND (install Pixel Art XL)'}")
    print(f"  checkpoints available: {len(ckpts)},  loras available: {len(loras)}")
    try:
        import PIL, numpy  # noqa
        print("  pixelate deps (pillow, numpy): OK")
    except ImportError:
        print("  pixelate deps: MISSING -> run: pip install pillow numpy")
    return 0 if (ckpt and lora) else 2


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("prompt", nargs="?", help="Text prompt for the sprite")
    ap.add_argument("--name", default=None)
    ap.add_argument("--size", type=int, default=64)
    ap.add_argument("--palette", default="none")
    ap.add_argument("--out", default="assets")
    ap.add_argument("--bg", default="auto", choices=["auto", "none", "rembg"])
    ap.add_argument("--raw-prompt", action="store_true")
    ap.add_argument("--host", default="127.0.0.1:8000")
    ap.add_argument("--checkpoint", default="auto")
    ap.add_argument("--lora", default="auto")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--cfg", type=float, default=7.5)
    ap.add_argument("--check", action="store_true", help="verify setup and exit")
    args = ap.parse_args()

    host = args.host
    if args.check:
        sys.exit(do_check(host))
    if not args.prompt:
        sys.exit("Provide a prompt, e.g.  python tools/comfyui/make_sprite.py \"a chest\" --name chest")

    ok, msg = reach(host)
    if not ok:
        sys.exit(msg)

    ckpt = args.checkpoint if args.checkpoint != "auto" else autodetect(
        host, "CheckpointLoaderSimple", "ckpt_name", CKPT_PREFS)
    lora = args.lora if args.lora != "auto" else autodetect(
        host, "LoraLoader", "lora_name", LORA_PREFS)
    if not ckpt:
        sys.exit("No SDXL checkpoint found in ComfyUI. Run with --check for details.")
    if not lora:
        sys.exit("No pixel-art LoRA found in ComfyUI. Run with --check for details.")

    prompt = args.prompt if args.raw_prompt else (args.prompt.rstrip(" .,") + STYLE_SUFFIX)
    seed = args.seed if args.seed is not None else uuid.uuid4().int % (2**32)
    name = args.name or "_".join(args.prompt.lower().split()[:4]) or "sprite"
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    wf = json.loads(WORKFLOW.read_text())
    wf.pop("_comment", None)
    wf["4"]["inputs"]["ckpt_name"] = ckpt
    wf["10"]["inputs"]["lora_name"] = lora
    wf["6"]["inputs"]["text"] = prompt
    wf["3"]["inputs"]["seed"] = seed
    wf["3"]["inputs"]["steps"] = args.steps
    wf["3"]["inputs"]["cfg"] = args.cfg
    wf["9"]["inputs"]["filename_prefix"] = f"sprite_raw_{name}"

    print(f"[make_sprite] checkpoint={ckpt} lora={lora} seed={seed}")
    print(f"[make_sprite] prompt: {prompt}")
    client_id = str(uuid.uuid4())
    pid = api(host, "/prompt", {"prompt": wf, "client_id": client_id})["prompt_id"]

    # wait for completion
    hist = {}
    start = time.time()
    while time.time() - start < 600:
        try:
            h = api(host, f"/history/{pid}", timeout=15)
        except Exception:
            h = {}
        if pid in h:
            hist = h[pid]
            break
        time.sleep(1.5)
    else:
        sys.exit("Render timed out.")

    # prefer a saved "output" image; fall back to any (e.g. a preview/temp)
    img = None
    for node_out in hist.get("outputs", {}).values():
        for i in node_out.get("images", []):
            if i.get("type", "output") == "output":
                img = i
                break
        if img:
            break
    if img is None:
        for node_out in hist.get("outputs", {}).values():
            imgs = node_out.get("images", [])
            if imgs:
                img = imgs[0]
                break
    if not img:
        sys.exit("No image returned by ComfyUI.")

    raw_path = RAW_DIR / f"{name}_{seed}.png"
    q = urllib.parse.urlencode(img)
    with urllib.request.urlopen(f"http://{host}/view?{q}", timeout=120) as r:
        raw_path.write_bytes(r.read())

    out_path = out_dir / f"{name}.png"
    subprocess.run([sys.executable, str(HERE / "pixelate.py"), str(raw_path), str(out_path),
                    "--size", str(args.size), "--palette", args.palette, "--bg", args.bg],
                   check=True)
    print(f"[make_sprite] DONE -> {out_path}")


if __name__ == "__main__":
    main()
