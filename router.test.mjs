// Node test for router.js — run with:  node router.test.mjs
// router.js is an ES module with `export`; import it via a data: URL so this
// works regardless of file extension / package "type".
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('./router.js', import.meta.url), 'utf-8');
const { routeSystem } = await import('data:text/javascript,' + encodeURIComponent(src));

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('ok   ', msg); else { console.error('FAIL ', msg); failures++; } };
const hseg = (segs, x1, x2, y) => segs.some(s => s.y1 === y && s.y2 === y && Math.min(s.x1, s.x2) === Math.min(x1, x2) && Math.max(s.x1, s.x2) === Math.max(x1, x2));
const vseg = (segs, x, y1, y2) => segs.some(s => s.x1 === x && s.x2 === x && Math.min(s.y1, s.y2) === Math.min(y1, y2) && Math.max(s.y1, s.y2) === Math.max(y1, y2));
const hasFit = (fs, x, y, type) => fs.some(f => f.x === x && f.y === y && f.type === type);
const axisAligned = segs => segs.every(s => s.x1 === s.x2 || s.y1 === s.y2);

// small helper parts that contribute a single on-line node at (x, pipeY)
const stub = (id, x, pipeY) => ({ id, x, y: pipeY - 20, w: 10, h: 40,
  ports: { outlet: { x: 0, y: 20, dir: 'left', tap: 'inline' } } });

// ------------------------------------------------------------------ 1. INLINE VALVE
{
  const pipeY = 300;
  const valve = { id: 'valve', x: 400, y: pipeY - 20, w: 100, h: 40,
    ports: { inlet: { x: 100, y: 20, dir: 'right', tap: 'inline' },   // abs x=500
             outlet: { x: 0, y: 20, dir: 'left', tap: 'inline' } } }; // abs x=400
  const { segments, fittings } = routeSystem(
    [stub('r', 600, pipeY), valve, stub('l', 300, pipeY)], { pipeY });

  ok(axisAligned(segments), 'valve: all segments axis-aligned');
  ok(hseg(segments, 300, 400, pipeY), 'valve: main line runs up to the inlet-side port');
  ok(hseg(segments, 500, 600, pipeY), 'valve: main line runs from the outlet-side port');
  ok(!hseg(segments, 400, 500, pipeY), 'valve: NO segment drawn through the body (gap)');
  ok(fittings.length === 0, 'valve: no fittings at an inline part');
}

// ------------------------------------------------------------------ 2. TEE (pressure tank)
{
  const pipeY = 300;
  const ptank = { id: 'ptank', x: 200, y: 100, w: 100, h: 120,
    ports: { outlet: { x: 50, y: 80, dir: 'down', tap: 'tee' } } };  // abs (250,180)
  const { segments, fittings } = routeSystem(
    [stub('r', 400, pipeY), ptank, stub('l', 100, pipeY)], { pipeY });

  ok(axisAligned(segments), 'tee: all segments axis-aligned');
  ok(vseg(segments, 250, 180, pipeY), 'tee: vertical branch from the port down to the line');
  ok(hasFit(fittings, 250, pipeY, 'tee'), 'tee: "tee" fitting where the branch meets the line');
  ok(hseg(segments, 100, 250, pipeY) && hseg(segments, 250, 400, pipeY), 'tee: main line passes through the tee');
}

// ------------------------------------------------------------------ 3. CONTACT TANK (up-and-over)
{
  const pipeY = 500;
  const tank = { id: 'contact', x: 300, y: 60, w: 200, h: 400,
    ports: { inlet: { x: 160, y: 380, dir: 'down', tap: 'inline' },   // abs (460,440) bottom half
             outlet: { x: 40, y: 20, dir: 'down', tap: 'inline' } } };// abs (340,80)  top half
  const { segments, fittings } = routeSystem(
    [stub('r', 600, pipeY), tank, stub('l', 100, pipeY)], { pipeY });
  const overX = 300 - 24; // 276

  ok(axisAligned(segments), 'contact: all segments axis-aligned');
  // bottom inlet: vertical to the line + elbow
  ok(vseg(segments, 460, 440, pipeY), 'contact: bottom inlet drops a riser to the line');
  ok(hasFit(fittings, 460, pipeY, 'elbow'), 'contact: elbow where the inlet meets the line');
  // top outlet: elbow, horizontal at outlet y, elbow, vertical drop, elbow
  ok(hasFit(fittings, 340, 80, 'elbow'), 'contact: elbow at the top outlet');
  ok(hseg(segments, 340, overX, 80), 'contact: horizontal run over the top at the outlet y');
  ok(hasFit(fittings, overX, 80, 'elbow'), 'contact: elbow at the top turn');
  ok(vseg(segments, overX, 80, pipeY), 'contact: vertical drop back to the line');
  ok(hasFit(fittings, overX, pipeY, 'elbow'), 'contact: elbow where the drop rejoins the line');
  // main line is diverted across the tank, but connects on both sides
  ok(!hseg(segments, overX, 460, pipeY), 'contact: main line NOT drawn straight across the tank');
  ok(hseg(segments, 100, overX, pipeY), 'contact: main line connects on the downstream (left) side');
  ok(hseg(segments, 460, 600, pipeY), 'contact: main line connects on the upstream (right) side');
}

// ------------------------------------------------------------------ 4. FILTER WITH A DRAIN
{
  const pipeY = 300;
  const filter = { id: 'filter', x: 400, y: 200, w: 120, h: 200,
    ports: { inlet: { x: 120, y: 100, dir: 'right', tap: 'inline' },  // abs (520,300)
             outlet: { x: 0, y: 100, dir: 'left', tap: 'inline' },    // abs (400,300)
             drain: { x: 60, y: 40, dir: 'down', tap: 'inline' } } }; // abs (460,240)
  const { segments, fittings } = routeSystem([filter], { pipeY });
  const dy = pipeY + 70;

  ok(axisAligned(segments), 'drain: all segments axis-aligned');
  ok(hseg(segments, 400, 460, pipeY) && hseg(segments, 460, 520, pipeY), 'drain: main line passes through the filter ports');
  ok(vseg(segments, 460, 240, pipeY), 'drain: drain drops from the port to the line');
  ok(hasFit(fittings, 460, pipeY, 'tee'), 'drain: tee where the drain crosses the line');
  ok(vseg(segments, 460, pipeY, dy), 'drain: drain continues below the line');
  ok(hasFit(fittings, 460, dy, 'elbow'), 'drain: elbow below the line');
  ok(hseg(segments, 460, 500, dy), 'drain: horizontal stub away from the system');
  ok(hasFit(fittings, 500, dy, 'drain'), 'drain: "drain" outlet marker at the stub end');
}

// ------------------------------------------------------------------ purity / shape / determinism
{
  const pipeY = 300;
  const input = [stub('a', 100, pipeY), stub('b', 200, pipeY)];
  const snapshot = JSON.stringify(input);
  const out1 = routeSystem(input, { pipeY });
  ok(JSON.stringify(input) === snapshot, 'purity: inputs are not mutated');
  const out2 = routeSystem(input, { pipeY });
  ok(JSON.stringify(out1) === JSON.stringify(out2), 'determinism: same input -> same output');
  const empty = routeSystem([], { pipeY });
  ok(empty.segments.length === 0 && empty.fittings.length === 0, 'empty input -> empty output');
  const validFit = out1.fittings.every(f => ['elbow', 'tee', 'drain'].includes(f.type));
  ok(validFit, 'shape: fitting types are only elbow/tee/drain');
}

// ------------------------------------------------------------------ smoke test over the REAL manifest
{
  const lib = JSON.parse(await readFile(new URL('./library.json', import.meta.url), 'utf-8'));
  // lay every part out left-to-right at a shared baseline and route them
  let x = 0;
  const placed = lib.parts.map(p => { const part = { ...p, x, y: 0 }; x += p.w + 60; return part; });
  const { segments, fittings } = routeSystem(placed, { pipeY: 800 });
  ok(axisAligned(segments), 'real manifest: every segment stays axis-aligned');
  ok(segments.length > 0, 'real manifest: produced pipe segments without throwing');
  ok(fittings.every(f => ['elbow', 'tee', 'drain'].includes(f.type)), 'real manifest: only valid fitting types');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
