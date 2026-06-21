# CLAUDE.md — CWS Diagram Library

This repo is a parts library + tool for building Clean Water Store system diagrams.
Diagrams are assembled from reusable component images instead of being drawn by hand.

## Structure
- `parts/` — component images (PNG now, SVG later). The real artwork.
- `library.json` — the manifest. The single source of truth: the list of parts.
- `builder.html` — the diagram tool. Reads the manifest; never needs editing to add parts.
- `add_part.py` — CLI to add a part (handles background removal + manifest entry).

## The golden rule
The manifest drives everything. Adding/changing a part = edit `parts/` + `library.json`.
**Never edit `builder.html` to add or change a part.**

## Adding a part (preferred: use the script)
```
python3 add_part.py --image PATH --name "Display Name" [--category ...] [--mount ...]
```
The script removes the background, trims, saves to `parts/`, and appends the manifest entry.

If doing it directly instead of via the script:
1. Put the cleaned, background-removed PNG in `parts/` (filename = the id, e.g. `uv_sterilizer.png`).
2. Append ONE entry to the `parts` array in `library.json`. Do not reformat or reorder
   the rest of the file — append/replace the single entry only.
3. Keep JSON valid: comma between entries, no trailing comma after the last one.

## Manifest entry format
```json
{"id":"uv_sterilizer","name":"UV Sterilizer","category":"fitting",
 "file":"parts/uv_sterilizer.png","label":"UV Sterilizer","mount":"base","w":120,"h":360}
```
- `id` — lowercase slug, unique. `name`/`label` — what the user sees.
- `category` — `tank` | `fitting` | `equipment` | `source`.
- `mount` — `base` (sits ON the pipe: tanks, valves, gauges, hose bibs, well head)
  or `riser` (floats above with a feed line: e.g. metering pump). Default `base`.
- `w`/`h` — the PNG's real pixel size. Required: all parts share one scale factor,
  so correct `w`/`h` keeps relative sizes true. Read them from the saved image.

## Harvesting parts in bulk (from many diagram PSDs)
To pull parts out of a large folder of diagram PSDs:
```
python3 harvest_parts.py --src /path/to/psd/folder --out harvest
```
It dedupes at the PART level (the Nth copy of a part is skipped), and writes:
- `harvest/candidates/` — one transparent PNG per unique part
- `harvest/parts_review.csv` — each part, how many diagrams use it, size, plan vs elevation
- `harvest/duplicates.csv` — byte-identical or same-config diagrams

Workflow: run it, review `parts_review.csv` (rename, mark which to keep / change), then add
the keepers to the library with `add_part.py --keep-bg` (the candidates are already cutouts).
Plan-view (top-down) parts are flagged `review`; keep them as separate ids (e.g. `_topview`)
if you build plan-view diagrams.

## Background removal
`add_part.py` does a basic edge-flood removal (keeps interior light areas like gauge faces).
For photos with soft shadows / busy backgrounds, prefer a premium cutout (Adobe "remove
background" or the `rembg` library), then add with `--keep-bg`.

## Testing a change
Open `builder.html` directly (uses embedded images) for a quick check, or serve the folder
(`python3 -m http.server`) so the builder reads `library.json` and `parts/` live.

## Notes
- Parts may be PNG or SVG; the builder renders whatever `file` points to. Migrate a part to
  SVG by swapping the file and updating `file` — nothing else changes.
- This is a static site; deploys via GitHub Pages, embeds in Miva via iframe.
- Do not run `/init`; this CLAUDE.md is hand-maintained.
