/*
 * router.js — pure piping router for Clean Water Store system diagrams.
 *
 * Dependency-free ES module. No DOM, no I/O, no globals, no mutation of the
 * inputs: routeSystem() reads only its arguments and returns plain data, so
 * the same inputs always give the same output and pipes reflow when parts move.
 *
 * MODEL — "main line with branches", flowing RIGHT to LEFT
 *   Source is on the right; treated water exits on the left. A single MAIN LINE
 *   runs horizontally at y = options.pipeY. Each part connects to it by one of
 *   four styles, chosen from its ports' `dir` and `tap`:
 *
 *   (a) INLINE part — a valve/gauge with exactly an inlet + outlet, both
 *       tap:"inline" and dir left/right. The part sits ON the line; its two
 *       ports are line nodes and the artwork bridges the body, so the main line
 *       is drawn up TO each port but NOT across the interior (no fittings).
 *
 *          ...====[ valve ]====...        (gap across the body)
 *
 *   (b) TEE part — any port with tap:"tee". A vertical branch drops from the
 *       port to the main line with a "tee" fitting where they meet; the main
 *       line passes straight through.
 *
 *   (c) UP/DOWN FLOW-THROUGH — an inline port with dir up/down (e.g. a contact
 *       tank: bottom inlet, top outlet). A bottom port connects to the line
 *       with a vertical + "elbow". A top port runs up-and-over: elbow, a
 *       horizontal at the port's own y clear of the part, elbow, a vertical
 *       drop to the line, elbow — like CWS diagrams where treated water exits
 *       over the top. The main line is diverted (gapped) across the part.
 *
 *          out ___________
 *             |           |               (top outlet, up-and-over)
 *          [ tank ]       |
 *          in |           |
 *      -------+     ...----+-------        main line at pipeY
 *
 *   (d) DRAIN — from the drain port, down through the line (tee) to
 *       pipeY + DRAIN_DROP, elbow, a short horizontal stub away from the
 *       system, ending in a "drain" marker fitting.
 *
 * OUTPUT — { segments, fittings }
 *   segments: [{ x1, y1, x2, y2 }]   every segment is axis-aligned (H or V);
 *                                    the main-line segments come first.
 *   fittings: [{ x, y, type }]       type: "elbow" | "tee" | "drain".
 */

const DRAIN_DROP = 70;   // how far a drain line continues below the main line
const DRAIN_STUB = 40;   // length of the horizontal stub at a drain outlet
const OVER_MARGIN = 24;  // how far past a part's edge an up-and-over clears it

const PORT_ORDER = ['inlet', 'outlet', 'drain'];
const r = Math.round;

function orderedPortNames(ports) {
  return Object.keys(ports).sort((a, b) => {
    const ia = PORT_ORDER.indexOf(a);
    const ib = PORT_ORDER.indexOf(b);
    const ra = ia < 0 ? PORT_ORDER.length : ia;
    const rb = ib < 0 ? PORT_ORDER.length : ib;
    return ra - rb || (a < b ? -1 : a > b ? 1 : 0);
  });
}

// Local port coords -> absolute coords, with tap defaulted to "inline".
function absPorts(part) {
  const out = {};
  const src = part.ports || {};
  for (const name in src) {
    const p = src[name];
    out[name] = { x: part.x + p.x, y: part.y + p.y, dir: p.dir, tap: p.tap || 'inline' };
  }
  return out;
}

// A "pure inline part": exactly inlet + outlet, both inline and dir left/right.
function isInline(ports) {
  const names = Object.keys(ports);
  if (names.length !== 2 || !ports.inlet || !ports.outlet) return false;
  return ['inlet', 'outlet'].every(n =>
    ports[n].tap === 'inline' && (ports[n].dir === 'left' || ports[n].dir === 'right'));
}

const vseg = (x, ya, yb) => ({ x1: r(x), y1: r(ya), x2: r(x), y2: r(yb) });
const hseg = (xa, xb, y) => ({ x1: r(xa), y1: r(y), x2: r(xb), y2: r(y) });
const fit  = (x, y, type) => ({ x: r(x), y: r(y), type });

/**
 * Compute the piping layout for a set of positioned parts.
 * @param {Array<{id,x,y,w,h,ports}>} placedParts  parts already placed on the
 *        canvas (x,y = top-left; ports are local coords from library.json).
 * @param {{pipeY:number}} options  pipeY = y of the horizontal main line.
 * @returns {{segments:Array, fittings:Array}}
 */
export function routeSystem(placedParts, options = {}) {
  const branches = [];   // non-main-line segments (risers, up-and-over, drains)
  const fittings = [];
  const { pipeY } = options;

  if (!placedParts || placedParts.length === 0) {
    return { segments: [], fittings };
  }

  // Flow order is right-to-left, but geometry is symmetric; sort by x with an
  // id tiebreak so the output is fully deterministic.
  const parts = placedParts
    .slice()
    .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const nodes = [];   // x positions where pipe touches the main line
  const gaps = [];    // [xa,xb] intervals where the main line must NOT be drawn

  for (const part of parts) {
    const ports = absPorts(part);
    if (Object.keys(ports).length === 0) continue;

    // (a) pure inline part: two side ports on the line, artwork bridges the body
    if (isInline(ports)) {
      const lo = Math.min(ports.inlet.x, ports.outlet.x);
      const hi = Math.max(ports.inlet.x, ports.outlet.x);
      nodes.push(lo, hi);
      gaps.push([lo, hi]);
      continue;
    }

    const flowNodes = [];  // up/down flow-through nodes (for the divert gap)
    const partNodes = [];
    for (const name of orderedPortNames(ports)) {
      const p = ports[name];

      if (name === 'drain') {
        // (d) drain: down through the line (tee) to pipeY+DROP, elbow, stub, marker
        branches.push(vseg(p.x, p.y, pipeY));
        fittings.push(fit(p.x, pipeY, 'tee'));
        const dy = pipeY + DRAIN_DROP;
        branches.push(vseg(p.x, pipeY, dy));
        fittings.push(fit(p.x, dy, 'elbow'));
        branches.push(hseg(p.x, p.x + DRAIN_STUB, dy));
        fittings.push(fit(p.x + DRAIN_STUB, dy, 'drain'));
        nodes.push(p.x); partNodes.push(p.x);

      } else if (p.tap === 'tee') {
        // (b) tee branch straight to the main line
        branches.push(vseg(p.x, p.y, pipeY));
        fittings.push(fit(p.x, pipeY, 'tee'));
        nodes.push(p.x); partNodes.push(p.x);

      } else if (p.dir === 'up' || p.dir === 'down') {
        // (c) up/down flow-through
        const topHalf = p.y < part.y + part.h / 2;
        if (topHalf) {
          // up-and-over: clear the part on the outgoing (outlet=left) or
          // incoming (inlet=right) side, then drop to the line
          const overX = name === 'inlet'
            ? part.x + part.w + OVER_MARGIN
            : part.x - OVER_MARGIN;
          fittings.push(fit(p.x, p.y, 'elbow'));
          branches.push(hseg(p.x, overX, p.y));
          fittings.push(fit(overX, p.y, 'elbow'));
          branches.push(vseg(overX, p.y, pipeY));
          fittings.push(fit(overX, pipeY, 'elbow'));
          nodes.push(overX); partNodes.push(overX); flowNodes.push(overX);
        } else {
          // bottom port: vertical to the line with an elbow where it turns
          branches.push(vseg(p.x, p.y, pipeY));
          fittings.push(fit(p.x, pipeY, 'elbow'));
          nodes.push(p.x); partNodes.push(p.x); flowNodes.push(p.x);
        }

      } else {
        // lone inline side port (e.g. a source outlet dir left) — sits on line
        nodes.push(p.x); partNodes.push(p.x);
      }
    }

    // A flow-through part with both a bottom and a top port diverts the main
    // line up-and-over between them — gap it so we don't draw straight across.
    if (flowNodes.length >= 2) {
      gaps.push([Math.min(...partNodes), Math.max(...partNodes)]);
    }
  }

  // Assemble the main line: connect consecutive unique node-x's at pipeY,
  // skipping any span whose midpoint falls inside a gap (valve body / divert).
  const uniq = [...new Set(nodes.map(r))].sort((a, b) => a - b);
  const mains = [];
  for (let i = 0; i < uniq.length - 1; i++) {
    const a = uniq[i], b = uniq[i + 1];
    const mid = (a + b) / 2;
    const gapped = gaps.some(g => mid >= Math.min(g[0], g[1]) && mid <= Math.max(g[0], g[1]));
    if (!gapped) mains.push(hseg(a, b, pipeY));
  }

  // Main line first (renders under the branches); drop any zero-length segments.
  const segments = [...mains, ...branches].filter(s => s.x1 !== s.x2 || s.y1 !== s.y2);
  return { segments, fittings };
}

export default routeSystem;
