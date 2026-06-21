#!/usr/bin/env python3
"""
harvest_parts.py — scan a folder full of diagram PSDs, find duplicates, and pull
one clean copy of every UNIQUE part.

The trick with thousands of diagrams: you don't process them as thousands of files,
you collapse them to the handful of unique components inside. The 50th "Pressure
Tank" layer is skipped; you keep one clean copy.

Usage:
    python3 harvest_parts.py --src /path/to/psd/folder [--out harvest]

Outputs (into --out, default ./harvest):
    candidates/           one transparent PNG per unique part (the representative copy)
    parts_review.csv      every unique part: name, how many diagrams use it, size, status
    duplicates.csv        diagrams that are byte-identical or share a config name
    (review parts_review.csv, rename/keep the good ones, then add keepers to library.json)

Handles PSDs (layered). Flattened PNG/JPG diagrams can be deduped but parts can't be
extracted from them — those are listed separately so you know what needs another approach.
"""
import argparse, csv, hashlib, os, re, sys
from collections import defaultdict
from psd_tools import PSDImage

# layer names that are structural noise, not real parts
JUNK = re.compile(r"^(shape\b|vector smart object|background$|layer \d+$|tpipe$|pipe$|elbow|dotted)", re.I)

def canon(name):
    n = name.lower().strip()
    n = re.sub(r"\bcopy\b", " ", n)
    n = re.sub(r"\s+\d+\b", " ", n)          # trailing "copy 2", " 3", etc.
    n = re.sub(r"[^a-z0-9]+", " ", n).strip()
    n = re.sub(r"\s+", " ", n)
    return n

def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")

def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(65536), b""):
            h.update(b)
    return h.hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", default="harvest")
    a = ap.parse_args()

    cand = os.path.join(a.out, "candidates")
    os.makedirs(cand, exist_ok=True)

    psds, flats = [], []
    for root, _, files in os.walk(a.src):
        for fn in files:
            p = os.path.join(root, fn)
            ext = fn.lower().rsplit(".", 1)[-1] if "." in fn else ""
            if ext == "psd":
                psds.append(p)
            elif ext in ("png", "jpg", "jpeg", "gif", "tif", "tiff"):
                flats.append(p)
    print(f"Found {len(psds)} PSDs, {len(flats)} flat images under {a.src}")

    # --- duplicate diagrams: byte-identical, and shared config-name ---
    by_hash, by_name = defaultdict(list), defaultdict(list)
    for p in psds:
        by_hash[sha(p)].append(p)
        by_name[os.path.splitext(os.path.basename(p))[0].lower()].append(p)
    with open(os.path.join(a.out, "duplicates.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(["type", "key", "files"])
        for h, fs in by_hash.items():
            if len(fs) > 1: w.writerow(["identical", h[:12], " | ".join(fs)])
        for n, fs in by_name.items():
            if len(fs) > 1: w.writerow(["same-name", n, " | ".join(fs)])

    # --- harvest unique parts (dedupe at the PART level) ---
    # canon-name -> best occurrence {area, file, layer ref-data}
    best = {}                      # canon -> (area, file, name)
    count = defaultdict(set)       # canon -> set(files) it appears in
    skipped = defaultdict(int)

    for i, p in enumerate(psds, 1):
        try:
            psd = PSDImage.open(p)
        except Exception as e:
            print(f"  ! skip {p}: {e}"); continue
        for layer in psd.descendants():
            if layer.is_group() or layer.kind == "type":
                continue
            if layer.kind != "pixel":          # shapes = pipes/arrows; not parts
                continue
            name = layer.name or ""
            c = canon(name)
            if not c or JUNK.match(c):
                skipped[c or "?"] += 1; continue
            b = layer.bbox
            if not b: continue
            w_, h_ = b[2] - b[0], b[3] - b[1]
            if w_ < 12 or h_ < 12:             # stray dots
                continue
            count[c].add(p)
            area = w_ * h_
            if c not in best or area > best[c][0]:
                best[c] = (area, p, name)
        if i % 50 == 0: print(f"  scanned {i}/{len(psds)} PSDs...")

    # extract the representative copy of each unique part
    rows = []
    for c, (area, p, name) in sorted(best.items()):
        psd = PSDImage.open(p)
        target = None
        for layer in psd.descendants():
            if layer.kind == "pixel" and canon(layer.name or "") == c and layer.bbox:
                b = layer.bbox
                if (b[2]-b[0])*(b[3]-b[1]) == area:
                    target = layer; break
        if not target:
            continue
        sid = slug(c)
        img = target.composite()
        img.save(os.path.join(cand, f"{sid}.png"))
        is_topview = "topview" in c or "top view" in c
        rows.append({
            "id": sid, "suggested_name": c.title().replace("Topview", "(Plan View)"),
            "used_in_diagrams": len(count[c]), "width": img.width, "height": img.height,
            "view": "plan" if is_topview else "elevation",
            "example_file": os.path.basename(p),
            "status": "review" if is_topview else "keep",
        })

    with open(os.path.join(a.out, "parts_review.csv"), "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else
                            ["id","suggested_name","used_in_diagrams","width","height","view","example_file","status"])
        wr.writeheader(); wr.writerows(rows)

    print(f"\nHarvested {len(rows)} unique parts -> {cand}")
    print(f"Review list -> {os.path.join(a.out,'parts_review.csv')}")
    if flats:
        print(f"Note: {len(flats)} flat images can't be layer-extracted (listed for a separate pass).")

if __name__ == "__main__":
    main()
