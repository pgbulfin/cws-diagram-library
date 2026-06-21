# CWS Diagram Library

A small, self-contained kit for building Clean Water Store system diagrams out of
reusable parts — instead of drawing each one by hand.

It has three pieces:

| File / folder    | What it is                                                        |
|------------------|-------------------------------------------------------------------|
| `parts/`         | The component images (PNG today, SVG later) — the real artwork.   |
| `library.json`   | The **manifest**: the list of parts and how each one behaves.     |
| `builder.html`   | The diagram tool. Reads the manifest and lets you assemble systems.|
| `add_part.py`    | One command to add a new part (handles screen-grabs).             |

The whole idea: **the manifest drives everything.** Add a part to `library.json`
and it shows up in the builder automatically. You never edit `builder.html`.

---

## Using the builder

Just open `builder.html` in any browser. Click parts to add them, remove with the
×, hit "Load example" to see a sample system, and export your diagram as **SVG**
(editable) or **PNG** (drop-in image).

It works two ways with no setup:
- **Open the file directly** → it uses the part images baked into it. Great for a
  quick look or sending to someone.
- **Serve it** (so it reads live files) → from this folder run:
  ```
  python3 -m http.server
  ```
  then open <http://localhost:8000/builder.html>. Now it reads `library.json` and
  `parts/` live, so parts you add show up immediately.

---

## Adding a new part

### The easy way — one command

Got a product you need a part for but no artwork? Take a small screen-grab off the
website and run:

```
python3 add_part.py --image ~/Downloads/uv-sterilizer.png --name "UV Sterilizer"
```

It cuts out the background, trims it, saves it into `parts/`, and adds it to the
manifest. Done — it's now in the builder.

Useful options:
- `--category tank | fitting | equipment | source`
- `--mount base | riser` — `base` sits on the pipe (tanks, valves, gauges);
  `riser` floats above with a feed line (like the metering pump).
- `--max-height 500` — normalize the size.
- `--keep-bg` — skip background removal (use if it's already a clean cutout, e.g.
  you ran it through Adobe's "remove background" first for a nicer edge).

### The manual way — drop a file, add one entry

Put `uv_sterilizer.png` in `parts/`, then add this block to the `parts` list in
`library.json`:

```json
{
  "id": "uv_sterilizer",
  "name": "UV Sterilizer",
  "category": "fitting",
  "file": "parts/uv_sterilizer.png",
  "label": "UV Sterilizer",
  "mount": "base",
  "w": 120,
  "h": 360
}
```

`w`/`h` are the image's pixel size (used to scale it correctly against the other
parts — they all share one scale, so relative sizes stay true).

---

## Parts can be PNG or SVG

Right now the parts are high-res PNGs extracted from the original diagram PSDs —
exact to what's on the site today. As parts get revised, you can replace any PNG
with a clean **SVG** version (scalable, recolorable). Change the `file` to the
`.svg` and the builder doesn't care — it just renders whatever the manifest points
to. So the library can improve one part at a time without anything breaking.

---

## Putting it online

This is a static site, so it deploys like the warehouse app:
1. Push this folder to a GitHub repo (e.g. `cws-diagram-library`).
2. Enable **GitHub Pages** on it.
3. Embed `builder.html` in a Miva page via an `<iframe>`, or link to it directly.

Saved diagrams (when you want staff/customers to save their builds) would go in a
Supabase table — the builder already produces the small JSON "spec" for each system
(the **Show spec** button), which is exactly what you'd store.
