#!/usr/bin/env python3
"""
add_part.py — add a new component to the diagram library in one command.

Typical use (a screen-grab of a product off the website):

    python3 add_part.py --image ~/Downloads/uv.png --name "UV Sterilizer"

What it does:
  1. Removes the (connected) background so the part sits cleanly on the pipe,
     like the other parts.  Interior light areas (a white gauge face, etc.)
     are preserved because only background touching the edges is removed.
  2. Trims the empty margins and saves it into parts/.
  3. Adds one entry to library.json — after which it appears in the builder
     automatically.  No edits to builder.html are ever needed.

Options:
  --name      Display name (required), e.g. "UV Sterilizer"
  --image     Path to the source image (required)
  --id        Slug id (default: derived from name, e.g. uv_sterilizer)
  --category  tank | fitting | equipment | source  (default: fitting)
  --mount     base | riser  (default: base)
                base  = sits on the pipe (tanks, valves, gauges, hose bibs)
                riser = floats above with a feed line (e.g. metering pump)
  --max-height  Normalize the part to this pixel height (default: keep as-is)
  --keep-bg     Skip background removal (use if the image is already a clean cutout)
  --tolerance   Background color tolerance, 0-100 (default 12)

For tricky photos (soft shadows, busy backgrounds) the built-in removal is basic.
For a premium cutout, run the image through Adobe's "remove background" first
(or the rembg library) and pass --keep-bg.
"""
import argparse, json, os, re, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(HERE, "parts")
MANIFEST = os.path.join(HERE, "library.json")


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def remove_background(im, tol_pct):
    """Flood-remove background that touches the image edges; keep interior pixels."""
    im = im.convert("RGBA")
    rgb = im.convert("RGB")
    sentinel = (1, 254, 2)
    tol = int(255 * tol_pct / 100)
    w, h = im.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for s in seeds:
        try:
            ImageDraw.floodfill(rgb, s, sentinel, thresh=tol)
        except Exception:
            pass
    px_rgb = rgb.load()
    px = im.load()
    for y in range(h):
        for x in range(w):
            if px_rgb[x, y] == sentinel:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    return im


def trim(im, pad=6):
    bbox = im.getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    out = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    out.paste(im, (pad, pad), im)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--id")
    ap.add_argument("--category", default="fitting",
                    choices=["tank", "fitting", "equipment", "source"])
    ap.add_argument("--mount", default="base", choices=["base", "riser"])
    ap.add_argument("--max-height", type=int)
    ap.add_argument("--keep-bg", action="store_true")
    ap.add_argument("--tolerance", type=int, default=12)
    a = ap.parse_args()

    if not os.path.exists(a.image):
        sys.exit(f"Image not found: {a.image}")
    pid = a.id or slugify(a.name)

    im = Image.open(a.image).convert("RGBA")
    if not a.keep_bg:
        im = remove_background(im, a.tolerance)
    im = trim(im)
    if a.max_height and im.height > a.max_height:
        s = a.max_height / im.height
        im = im.resize((max(1, int(im.width * s)), a.max_height), Image.LANCZOS)

    os.makedirs(PARTS, exist_ok=True)
    rel = f"parts/{pid}.png"
    im.save(os.path.join(HERE, rel))

    man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {"version": 1, "parts": []}
    entry = {"id": pid, "name": a.name, "category": a.category, "file": rel,
             "label": a.name, "mount": a.mount, "w": im.width, "h": im.height}
    man["parts"] = [p for p in man.get("parts", []) if p["id"] != pid] + [entry]
    json.dump(man, open(MANIFEST, "w"), indent=2)

    print(f"Added '{a.name}'  ->  {rel}  ({im.width}x{im.height}, mount={a.mount})")
    print("It will appear in the builder palette automatically.")


if __name__ == "__main__":
    main()
