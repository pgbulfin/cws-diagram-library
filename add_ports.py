#!/usr/bin/env python3
"""add_ports.py — add connection "ports" to parts in library.json.

Ports let the diagram builder auto-route piping: each port is a point in the
part's OWN pixel coordinates (0,0 = top-left of the PNG, using the part's w/h)
plus a "dir" for which way the pipe leaves the port ("left"/"right"/"up"/"down").

Rules (applied ONLY to parts missing a "ports" object, so this is safe to
re-run after adding new parts):

  source (well_head):
      outlet = { x: w/2, y: h/2, dir: "left" }
  mount "riser" (e.g. metering_pump):      # feeds down through one line
      outlet = { x: w/2, y: h,   dir: "down" }
  tank / equipment (tap the pipe at the base):
      inlet  = { x: 0,   y: h,   dir: "down" }
      outlet = { x: w,   y: h,   dir: "down" }
      + drain = { x: w/2, y: h,  dir: "down" }  # backwashing filters/softeners only
  fitting (inline on the pipe):
      inlet  = { x: 0,   y: h/2, dir: "left" }
      outlet = { x: w,   y: h/2, dir: "right" }

Precedence: source > riser > tank/equipment > fitting. All coordinates are
rounded to integers. The rest of library.json is left byte-for-byte unchanged.

Usage:
    python3 add_ports.py            # update library.json in place
    python3 add_ports.py --dry-run  # print what would change, write nothing
"""
import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LIBRARY = os.path.join(HERE, "library.json")

# Backwashing filters/softeners also get a base drain port. This is not
# derivable from category/mount, so it is an explicit id set.
BACKWASH_IDS = {
    "iron_filter",
    "greensand_filter",
    "neutralizer_filter",
    "carbon_filter",
    "water_softener",
    "spindown_filter",
}


def r(n):
    """Round to a plain int (coordinates are pixels)."""
    return int(round(n))


def ports_for(part):
    """Return the ports dict for a part, or None if no rule applies."""
    w, h = part["w"], part["h"]
    category = part.get("category")
    mount = part.get("mount", "base")

    if category == "source":
        return {"outlet": {"x": r(w / 2), "y": r(h / 2), "dir": "left"}}

    if mount == "riser":
        return {"outlet": {"x": r(w / 2), "y": r(h), "dir": "down"}}

    if category in ("tank", "equipment"):
        ports = {
            "inlet": {"x": 0, "y": r(h), "dir": "down"},
            "outlet": {"x": r(w), "y": r(h), "dir": "down"},
        }
        if part["id"] in BACKWASH_IDS:
            ports["drain"] = {"x": r(w / 2), "y": r(h), "dir": "down"}
        return ports

    if category == "fitting":
        return {
            "inlet": {"x": 0, "y": r(h / 2), "dir": "left"},
            "outlet": {"x": r(w), "y": r(h / 2), "dir": "right"},
        }

    return None


def dump_matching_original(data):
    """Serialize with the same formatting library.json already uses:
    2-space indent, CRLF line endings, no trailing newline."""
    text = json.dumps(data, indent=2, ensure_ascii=False)
    return text.replace("\r\n", "\n").replace("\n", "\r\n")


def main():
    ap = argparse.ArgumentParser(description="Add connection ports to library.json parts.")
    ap.add_argument("--dry-run", action="store_true", help="report changes without writing")
    args = ap.parse_args()

    with open(LIBRARY, "r", encoding="utf-8") as f:
        data = json.load(f)

    added, skipped, no_rule = [], [], []
    for part in data.get("parts", []):
        if "ports" in part:
            skipped.append(part["id"])
            continue
        ports = ports_for(part)
        if ports is None:
            no_rule.append(part["id"])
            continue
        part["ports"] = ports  # appended after existing keys, order preserved
        added.append(part["id"])

    print(f"added ports:  {len(added)}  {added}")
    print(f"already had:  {len(skipped)}  {skipped}")
    if no_rule:
        print(f"NO RULE (unchanged): {len(no_rule)}  {no_rule}")

    if args.dry_run:
        print("--dry-run: library.json not written")
        return

    if added:
        with open(LIBRARY, "wb") as f:
            f.write(dump_matching_original(data).encode("utf-8"))
        print(f"wrote {LIBRARY}")
    else:
        print("nothing to add; library.json unchanged")


if __name__ == "__main__":
    main()
