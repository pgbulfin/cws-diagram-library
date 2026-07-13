/*
 * router.js — pure piping router for Clean Water Store system diagrams.
 *
 * Dependency-free ES module. No DOM, no I/O, no globals, no mutation of the
 * inputs: routeSystem() reads only its arguments and returns plain data, so
 * the same inputs always give the same output. The caller just re-runs it on
 * every drag and the pipes reflow automatically when parts move.
 *
 * MODEL — "trunk + risers"
 *   The plumbing is one horizontal TRUNK line at y = pipeY, with vertical
 *   RISERS dropping from each part's ports down to the trunk:
 *
 *        [ tank ]                 [ filter ]
 *      inlet|   |outlet        inlet|   |outlet
 *           |   |                   |   | drain
 *      -----+---+-------------------+---+----------   <- trunk at pipeY
 *                                       |  (tee)
 *                                       |               drain continues below
 *                                       +-----> outlet  the trunk
 *
 *   1. Parts are sorted left-to-right by x.
 *   2. Each port is converted from local coords to absolute canvas coords
 *      (part.x + port.x, part.y + port.y).
 *   3. The trunk runs from the first part's inlet to the last part's outlet
 *      (widened if needed so every riser actually lands on it).
 *   4. Every "down" port drops a vertical riser to the trunk and records a
 *      fitting where it lands: "elbow" for inlet/outlet, "tee" for drain.
 *   5. Ports that point "left"/"right" (inline fittings, gauges, the source)
 *      sit ON the trunk and get no riser.
 *   6. A drain continues past the trunk: down to pipeY + DRAIN_DROP, an elbow,
 *      a short horizontal stub, ending in a "drain" outlet marker (for an
 *      arrow/label downstream).
 *
 * OUTPUT — { segments, fittings }
 *   segments: [{ x1, y1, x2, y2 }]   every segment is axis-aligned (H or V).
 *   fittings: [{ x, y, type }]       type: "elbow" | "tee" | "drain".
 *                                    "elbow"/"tee" are trunk joints; "drain"
 *                                    marks the terminal drain outlet.
 */

// Drain geometry (pixels, in canvas scale): how far the drain line continues
// below the trunk, and the length of the horizontal stub at its outlet.
const DRAIN_DROP = 70;
const DRAIN_STUB = 40;

// Ports are visited in this order so the output is deterministic regardless of
// key order in the manifest. Unknown names sort after these, alphabetically.
const PORT_ORDER = ['inlet', 'outlet', 'drain'];

function orderedPortNames(ports) {
  return Object.keys(ports).sort((a, b) => {
    const ia = PORT_ORDER.indexOf(a);
    const ib = PORT_ORDER.indexOf(b);
    const ra = ia < 0 ? PORT_ORDER.length : ia;
    const rb = ib < 0 ? PORT_ORDER.length : ib;
    return ra - rb || (a < b ? -1 : a > b ? 1 : 0);
  });
}

// Local port coords -> absolute canvas coords. Returns null if the port is
// absent so callers can skip missing inlets/outlets safely.
function absPort(part, name) {
  const p = part.ports && part.ports[name];
  if (!p) return null;
  return { x: part.x + p.x, y: part.y + p.y, dir: p.dir };
}

/**
 * Compute the piping layout for a set of positioned parts.
 * @param {Array<{id,x,y,w,h,ports}>} placedParts  parts already placed on the
 *        canvas (x,y = top-left; ports are local coords from library.json).
 * @param {{pipeY:number}} options  pipeY = y of the horizontal trunk line.
 * @returns {{segments:Array, fittings:Array}}
 */
export function routeSystem(placedParts, options = {}) {
  const segments = [];
  const fittings = [];
  const { pipeY } = options;

  if (!placedParts || placedParts.length === 0) {
    return { segments, fittings };
  }

  // 1. Sort left-to-right. Tiebreak on id so the output is fully deterministic.
  const parts = placedParts
    .slice()
    .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 2 + 4 + 6. Walk every port. "down" ports get risers/fittings; horizontal
  // ports just touch the trunk. touchX collects every x where pipe meets the
  // trunk so we can guarantee the trunk spans all of them.
  const touchX = [];
  for (const part of parts) {
    if (!part.ports) continue;
    for (const name of orderedPortNames(part.ports)) {
      const ap = absPort(part, name);
      if (!ap) continue;

      if (ap.dir === 'down') {
        // Vertical riser from the port down to the trunk.
        segments.push({ x1: ap.x, y1: ap.y, x2: ap.x, y2: pipeY });
        touchX.push(ap.x);

        if (name === 'drain') {
          // Tee where the drain crosses the trunk, then continue below it:
          // down a bit, elbow, a short stub, ending in a drain outlet marker.
          fittings.push({ x: ap.x, y: pipeY, type: 'tee' });
          const dy = pipeY + DRAIN_DROP;
          segments.push({ x1: ap.x, y1: pipeY, x2: ap.x, y2: dy });
          fittings.push({ x: ap.x, y: dy, type: 'elbow' });
          segments.push({ x1: ap.x, y1: dy, x2: ap.x + DRAIN_STUB, y2: dy });
          fittings.push({ x: ap.x + DRAIN_STUB, y: dy, type: 'drain' });
        } else {
          // inlet / outlet: an elbow onto the trunk.
          fittings.push({ x: ap.x, y: pipeY, type: 'elbow' });
        }
      } else if (ap.dir === 'left' || ap.dir === 'right') {
        // 5. Inline fitting / source port — sits on the trunk, no riser.
        touchX.push(ap.x);
      }
      // "up" ports (none today) route away from the trunk and are ignored.
    }
  }

  // 3. Horizontal trunk at pipeY: first part's inlet -> last part's outlet,
  //    widened to cover every riser so none dangles off the end.
  const first = parts[0];
  const last = parts[parts.length - 1];
  const startPt = absPort(first, 'inlet') || absPort(first, 'outlet');
  const endPt = absPort(last, 'outlet') || absPort(last, 'inlet');

  if (touchX.length > 0) {
    const minX = Math.min(...touchX);
    const maxX = Math.max(...touchX);
    const x1 = startPt ? Math.min(startPt.x, minX) : minX;
    const x2 = endPt ? Math.max(endPt.x, maxX) : maxX;
    if (x1 !== x2) {
      // Trunk first so it renders under the risers/fittings.
      segments.unshift({ x1, y1: pipeY, x2, y2: pipeY });
    }
  }

  return { segments, fittings };
}

export default routeSystem;
