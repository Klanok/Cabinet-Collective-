/**
 * Circular arcs on a profile boundary.
 *
 * Reference figures, worked longhand so they can be checked against a straightedge and a
 * tape rather than against whatever the code happened to print.
 *
 * ## The reference shelf
 *
 * 900 long, 300 deep at its ends, front bowed out 50mm at the middle. That is how a shelf
 * like this actually gets described — nobody measures the radius, they measure how far it
 * bows over how wide.
 *
 *   chord      c = 900
 *   sagitta    s = 50
 *   radius     r = (c²/4 + s²) / 2s = (202500 + 2500) / 100 = 205000 / 100 = 2050
 *   check      r − r·cos(θ/2) must come back to the 50 we started from
 *   bulge      b = 2s/c = 100/900 = 0.111111…
 *   sweep      θ = 4·atan(b) = 0.442628885 rad = 25.360767°
 *   arc        r·θ = 2050 × 0.442628885 = 907.389214
 *
 * So the front edge is **907.4mm of banding, not 900** — 7.4mm more tape than the flat
 * rectangle it looks like on a cutting list. And the part is 350 deep at the middle, not
 * 300, which is the figure that has to fit on the sheet.
 *
 *   segment area  (r²/2)(θ − sin θ) = (4202500/2)(0.442628885 − 0.428243) = 30073.944
 *   total area    900 × 300 + 30073.944 = 300073.944
 *
 * ## The reference quarter round
 *
 * A 300mm radius through 90°, which is the shape of an enclosed radiused end.
 *
 *   arc      r·θ = 300 × π/2 = 471.238898
 *   chord    r·√2 = 424.264069
 *   sagitta  r − r·cos45° = 300 − 212.132034 = 87.867966
 *   bulge    tan(90°/4) = tan22.5° = 0.414213562
 *
 * ## Semicircle
 *
 *   chord 100 ⇒ r = 50, arc = 50π = 157.079633, bulge = tan45° = 1
 */

import { describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  arcGeometry,
  arcLength,
  arcSegmentArea,
  arcTo,
  bulgeForSweep,
  isArcEdge,
  sweepForBulge,
} from '../src/core/geom/arc.ts';
import {
  bowedFrontProfile,
  flattenPolygonPoints,
  flattenPolygonSegments,
  isRectangular,
  polygonPerimeter,
  profileArea,
  profileEdgeLengths,
  profileExtent,
  profileHasArcs,
  radiusFromChordAndSagitta,
  rectProfile,
  signedArea,
  sweepFromChordAndRadius,
} from '../src/core/geom/profile.ts';
import { extrudeProfile } from '../src/core/geom/extrude.ts';
import { v2 } from '../src/core/geom/vec.ts';
import {
  cylindricalForming,
  developedLength,
  formPoint,
  formedMesh,
} from '../src/core/model/forming.ts';

const SHELF_RADIUS = 2050;
const SHELF_SWEEP = 0.442628885;
const SHELF_ARC = 907.389214;

describe('arc geometry', () => {
  it('puts the centre of a quarter circle where a compass would', () => {
    // From (1,0) to (0,1) sweeping 90° counter-clockwise is the unit circle about the origin.
    const g = arcGeometry(v2(1, 0), v2(0, 1), bulgeForSweep(Math.PI / 2));
    expect(g.centre.x).toBeCloseTo(0, 9);
    expect(g.centre.y).toBeCloseTo(0, 9);
    expect(g.radius).toBeCloseTo(1, 9);
    expect(g.ccw).toBe(true);
  });

  it('lands a semicircle centre on the middle of its chord', () => {
    const g = arcGeometry(v2(0, 0), v2(100, 0), 1);
    expect(g.centre.x).toBeCloseTo(50, 9);
    expect(g.centre.y).toBeCloseTo(0, 9);
    expect(g.radius).toBeCloseTo(50, 9);
    expect(arcLength(v2(0, 0), v2(100, 0), 1)).toBeCloseTo(157.079633, 5);
  });

  it('carries the centre across the chord for a major arc', () => {
    // Past a semicircle the centre has to end up on the other side of the chord, or the arc
    // is the short way round rather than the long way.
    const minor = arcGeometry(v2(0, 0), v2(100, 0), 0.5);
    const major = arcGeometry(v2(0, 0), v2(100, 0), 2);
    expect(minor.centre.y).toBeGreaterThan(0);
    expect(major.centre.y).toBeLessThan(0);
    expect(Math.abs(major.sweep)).toBeGreaterThan(Math.PI);
  });

  it('bows a positive bulge to the right of travel, which is outward on an outline', () => {
    // Travelling +X, the right-hand side is −Y. This is the sign convention everything
    // downstream leans on: positive means convex, material bulging out.
    const g = arcGeometry(v2(0, 0), v2(100, 0), 0.2);
    expect(g.sagitta).toBeCloseTo(10, 9); // b·c/2
    expect(g.centre.y).toBeGreaterThan(0); // centre on the left, so the arc bows right
  });

  it('round-trips a sweep through the bulge', () => {
    for (const deg of [5, 25.360767, 90, 179, 181, 300]) {
      const rad = (deg * Math.PI) / 180;
      expect(sweepForBulge(bulgeForSweep(rad))).toBeCloseTo(rad, 9);
    }
  });

  it('agrees with the sagitta a shop would measure on the reference shelf', () => {
    const bulge = (2 * 50) / 900;
    const g = arcGeometry(v2(900, 300), v2(0, 300), bulge);
    expect(g.radius).toBeCloseTo(SHELF_RADIUS, 6);
    expect(g.sweep).toBeCloseTo(SHELF_SWEEP, 9);
    // The independent check: a radius r subtending θ stands r − r·cos(θ/2) off its chord.
    expect(g.radius - g.radius * Math.cos(g.sweep / 2)).toBeCloseTo(50, 6);
    expect(g.sagitta).toBeCloseTo(50, 9);
  });

  it('treats a vanishingly small bulge as straight rather than as a colossal circle', () => {
    expect(isArcEdge({ x: 0, y: 0 })).toBe(false);
    expect(isArcEdge({ x: 0, y: 0, bulge: 0 })).toBe(false);
    expect(isArcEdge({ x: 0, y: 0, bulge: 1e-15 })).toBe(false);
    expect(isArcEdge({ x: 0, y: 0, bulge: 0.001 })).toBe(true);
  });

  it('refuses an arc between two points in the same place', () => {
    expect(() => arcGeometry(v2(5, 5), v2(5, 5), 0.5)).toThrow(/distinct endpoints/);
  });

  it('builds the reference quarter round from a sweep in degrees', () => {
    // 300 radius through 90°: the shape of an enclosed radiused end.
    const start = v2(300, 0);
    const end = v2(0, 300);
    const vertex = arcTo(start.x, start.y, 90);
    expect(vertex.bulge).toBeCloseTo(0.414213562, 9);
    const g = arcGeometry(vertex, end, vertex.bulge!);
    expect(g.radius).toBeCloseTo(300, 9);
    expect(g.chord).toBeCloseTo(424.264069, 5);
    expect(g.sagitta).toBeCloseTo(87.867966, 5);
    expect(arcLength(vertex, end, vertex.bulge!)).toBeCloseTo(471.238898, 5);
  });

  it('takes a sweep back off a chord and a radius', () => {
    expect(sweepFromChordAndRadius(mm(424.264069), mm(300))).toBeCloseTo(Math.PI / 2, 6);
    expect(sweepFromChordAndRadius(mm(100), mm(50))).toBeCloseTo(Math.PI, 6);
  });

  it('will not span a chord with a radius too small to reach across it', () => {
    // Two 400mm apart cannot be joined by a 100mm radius; the tightest reach is a semicircle
    // at twice the radius. Silently clamping this would produce a part that is not the shape
    // anybody asked for.
    expect(() => sweepFromChordAndRadius(mm(400), mm(100))).toThrow(/cannot span/);
  });

  it('signs the segment area so a scoop subtracts and a bulge adds', () => {
    const out = arcSegmentArea(v2(0, 0), v2(100, 0), 0.5);
    const inn = arcSegmentArea(v2(0, 0), v2(100, 0), -0.5);
    expect(out).toBeGreaterThan(0);
    expect(inn).toBeCloseTo(-out, 9);
  });
});

describe('a circle written as two semicircular edges', () => {
  // The sharpest test of whether area, perimeter and bounds are exact rather than nearly
  // right: a 200-diameter circle as a two-vertex ring, both edges bulge 1.
  const circle = {
    outline: [
      { x: 0, y: 0, bulge: 1 },
      { x: 200, y: 0, bulge: 1 },
    ],
    holes: [],
  };

  it('has area πr², not the zero its two vertices would give', () => {
    expect(signedArea(circle.outline)).toBeCloseTo(Math.PI * 100 * 100, 6);
    expect(profileArea(circle)).toBeCloseTo(Math.PI * 10000, 6);
  });

  it('has circumference 2πr, not the 400 of its two chords', () => {
    expect(polygonPerimeter(circle.outline)).toBeCloseTo(2 * Math.PI * 100, 6);
  });

  it('is 200 × 200, which no vertex of it touches', () => {
    // Both vertices sit on y = 0. Read off the vertices alone the height would be zero.
    expect(profileExtent(circle)).toEqual({ length: 200, width: 200 });
  });

  it('is not rectangular, whatever its four-corner bounding box suggests', () => {
    expect(isRectangular(circle)).toBe(false);
    expect(profileHasArcs(circle)).toBe(true);
  });
});

describe('the reference radiused shelf', () => {
  const shelf = bowedFrontProfile(mm(900), mm(300), mm(50), 'L2');

  it('derives 2050 radius from the 900 chord and 50 bow', () => {
    expect(radiusFromChordAndSagitta(mm(900), mm(50))).toBeCloseTo(2050, 9);
  });

  it('is 350 deep at the middle, which is what has to fit the sheet', () => {
    expect(profileExtent(shelf)).toEqual({ length: 900, width: 350 });
  });

  it('bands the front at 907.4, not at the 900 the chord says', () => {
    const edges = profileEdgeLengths(shelf);
    expect(edges.L2).toBeCloseTo(SHELF_ARC, 5);
    expect(edges.L2 - 900).toBeCloseTo(7.389214, 5);
    // The three straight sides are untouched.
    expect(edges.L1).toBeCloseTo(900, 9);
    expect(edges.W1).toBeCloseTo(300, 9);
    expect(edges.W2).toBeCloseTo(300, 9);
  });

  it('gains the circular segment on top of the rectangle', () => {
    expect(profileArea(shelf)).toBeCloseTo(300073.944, 3);
    expect(profileArea(shelf) - 900 * 300).toBeCloseTo(30073.944, 3);
  });

  it('is wound counter-clockwise, like every other outline', () => {
    expect(signedArea(shelf.outline)).toBeGreaterThan(0);
  });

  it('is a plain rectangle when nothing is asked to bow', () => {
    const flat = bowedFrontProfile(mm(900), mm(300), mm(0), 'L2');
    expect(isRectangular(flat)).toBe(true);
    expect(flat).toEqual(rectProfile(mm(900), mm(300)));
  });

  it('will not bow a front backwards', () => {
    expect(() => bowedFrontProfile(mm(900), mm(300), mm(-50), 'L2')).toThrow(/positive/);
  });
});

describe('a scooped edge', () => {
  // The same shelf with the front curving away instead of toward you — negative bulge.
  const scooped = {
    outline: [v2(0, 0), v2(900, 0), { x: 900, y: 300, bulge: -(2 * 50) / 900 }, v2(0, 300)],
    holes: [],
  };

  it('loses the segment area rather than gaining it', () => {
    expect(profileArea(scooped)).toBeCloseTo(900 * 300 - 30073.944, 3);
  });

  it('is only 300 deep, because the curve never reaches past the corners', () => {
    expect(profileExtent(scooped)).toEqual({ length: 900, width: 300 });
  });

  it('still costs the arc in banding — a concave edge is no shorter', () => {
    expect(profileEdgeLengths(scooped).L2).toBeCloseTo(SHELF_ARC, 5);
  });
});

describe('flattening, which is for drawing and nothing else', () => {
  const shelf = bowedFrontProfile(mm(900), mm(300), mm(50), 'L2');

  it('keeps every segment within tolerance of the true curve', () => {
    const tol = mm(0.05);
    const segments = flattenPolygonSegments(shelf.outline, tol);
    const g = arcGeometry(v2(900, 300), v2(0, 300), (2 * 50) / 900);
    for (const s of segments) {
      const midX = (s.a.x + s.b.x) / 2;
      const midY = (s.a.y + s.b.y) / 2;
      const d = Math.hypot(midX - g.centre.x, midY - g.centre.y);
      // Points on straight sides are nowhere near the arc's circle; only judge the ones that
      // came off it.
      if (Math.abs(d - g.radius) < 1) expect(g.radius - d).toBeLessThanOrEqual(tol + 1e-9);
    }
  });

  it('closes exactly on the stored vertices, never on re-derived ones', () => {
    // A curve that ends a hundredth off its neighbour's start is a part with a step in it.
    const points = flattenPolygonPoints(shelf.outline);
    expect(points).toContainEqual({ x: 0, y: 0 });
    expect(points).toContainEqual({ x: 900, y: 0 });
    expect(points).toContainEqual({ x: 900, y: 300 });
    expect(points).toContainEqual({ x: 0, y: 300 });
  });

  it('runs as one closed chain, each segment starting where the last one ended', () => {
    const segments = flattenPolygonSegments(shelf.outline);
    for (let i = 0; i < segments.length; i++) {
      const next = segments[(i + 1) % segments.length]!;
      expect(segments[i]!.b.x).toBeCloseTo(next.a.x, 9);
      expect(segments[i]!.b.y).toBeCloseTo(next.a.y, 9);
    }
  });

  it('gives a straight edge one normal and a curved edge a turning one', () => {
    const segments = flattenPolygonSegments(shelf.outline);
    const straight = segments.find((s) => s.a.y === 0 && s.b.y === 0)!;
    expect(straight.na).toEqual(straight.nb);
    expect(straight.na.y).toBeCloseTo(-1, 9); // the back edge faces −Y

    const curved = segments.filter((s) => s.na.x !== s.nb.x || s.na.y !== s.nb.y);
    expect(curved.length).toBeGreaterThan(4);
    for (const s of curved) {
      expect(Math.hypot(s.na.x, s.na.y)).toBeCloseTo(1, 9);
      expect(s.na.y).toBeGreaterThan(0); // a convex front faces outward, +Y
    }
  });

  it('uses more segments for a tighter radius', () => {
    const gentle = flattenPolygonSegments(bowedFrontProfile(mm(900), mm(300), mm(10), 'L2').outline);
    const tight = flattenPolygonSegments(bowedFrontProfile(mm(900), mm(300), mm(299), 'L2').outline);
    expect(tight.length).toBeGreaterThan(gentle.length);
  });

  it('does not flatten anything that has no curve on it', () => {
    // A straight part must produce exactly its own four edges, or every existing mesh in the
    // app just got more expensive to draw for no reason.
    expect(flattenPolygonSegments(rectProfile(mm(600), mm(400)).outline)).toHaveLength(4);
  });
});

describe('extruding a curved part', () => {
  const shelf = bowedFrontProfile(mm(900), mm(300), mm(50), 'L2');

  it('builds a closed mesh with the curve in it', () => {
    const mesh = extrudeProfile(shelf, mm(18));
    expect(mesh.positions.length % 3).toBe(0);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.positions.length / 3).toBeGreaterThan(4 * 6);
    // Every vertex sits on one face or the other, and inside the part's own extent.
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const z = mesh.positions[i + 2]!;
      expect(z === 0 || z === 18).toBe(true);
      expect(mesh.positions[i]!).toBeGreaterThanOrEqual(-1e-6);
      expect(mesh.positions[i]!).toBeLessThanOrEqual(900 + 1e-6);
      expect(mesh.positions[i + 1]!).toBeLessThanOrEqual(350 + 1e-6);
    }
  });

  it('reaches the full 350 depth in the mesh, not just in the extent', () => {
    const mesh = extrudeProfile(shelf, mm(18));
    let maxY = 0;
    for (let i = 1; i < mesh.positions.length; i += 3) maxY = Math.max(maxY, mesh.positions[i]!);
    expect(maxY).toBeCloseTo(350, 1);
  });

  it('leaves the mesh of a straight part exactly as it was', () => {
    const mesh = extrudeProfile(rectProfile(mm(600), mm(400)), mm(16));
    // 4 outline verts × 2 faces + 4 walls × 4 verts.
    expect(mesh.positions.length / 3).toBe(8 + 16);
  });
});

describe('bending a flat part', () => {
  /*
   * A 3mm skin bent through a quarter turn at a 554mm inside radius — the reference radiused
   * end. Worked longhand:
   *
   *   neutral radius   554 + 0.5×3 = 555.5
   *   developed        555.5 × π/2 = 872.5774      what it is cut to, flat
   *   bent envelope    the B-face traces r = 554 from φ=0 to φ=π/2, so the part sweeps from
   *                    (s=0, n=0) round to (s=554, n=−554); the A-face runs 3 further out,
   *                    reaching s = 557 and n = −554.
   */
  const INNER = 554;
  const T = 3;
  const skin = cylindricalForming('x', mm(INNER), Math.PI / 2);

  it('leaves the start of the bend exactly where the flat part had it', () => {
    for (const z of [0, 1.5, T]) {
      const p = formPoint(skin, mm(T), { x: mm(0), y: mm(100), z: mm(z) });
      expect(p.x).toBeCloseTo(0, 9);
      expect(p.y).toBeCloseTo(100, 9);
      expect(p.z).toBeCloseTo(z, 9);
    }
  });

  it('traces the inside face round a circle of exactly the inside radius', () => {
    // This is what has to be true for the skin to sit down on the formers rather than bridge
    // between them.
    const centre = { s: 0, n: -INNER };
    for (const along of [0, 200, 500, 872.5774]) {
      const p = formPoint(skin, mm(T), { x: mm(along), y: mm(0), z: mm(0) });
      expect(Math.hypot(p.x - centre.s, p.z - centre.n)).toBeCloseTo(INNER, 6);
    }
  });

  it('carries the across-the-bend co-ordinate through untouched', () => {
    // A cylinder is dead straight in that direction, which is the reason bendy ply can make
    // one and not a dome.
    for (const y of [0, 360, 720]) {
      expect(formPoint(skin, mm(T), { x: mm(400), y: mm(y), z: mm(0) }).y).toBe(y);
    }
  });

  it('finishes the quarter turn square to where it started', () => {
    const end = formPoint(skin, mm(T), { x: mm(872.5774), y: mm(0), z: mm(0) });
    expect(end.x).toBeCloseTo(INNER, 3);
    expect(end.z).toBeCloseTo(-INNER, 3);
  });

  it('runs on flat past the end of the bend, so a fixing tab stays a tab', () => {
    const end = formPoint(skin, mm(T), { x: mm(872.5774), y: mm(0), z: mm(0) });
    const tab = formPoint(skin, mm(T), { x: mm(872.5774 + 50), y: mm(0), z: mm(0) });
    // The tangent at a quarter turn points along −n, so a 50mm tab drops 50mm and goes no
    // further round.
    expect(tab.x).toBeCloseTo(end.x, 4);
    expect(tab.z).toBeCloseTo(end.z - 50, 4);
  });

  it('keeps the developed length: the bend is exactly a quarter turn', () => {
    const dev = developedLength(skin, mm(T));
    expect(dev).toBeCloseTo(872.5774, 3);
    // Walk the neutral surface in small steps and add up the chords; it must come back to the
    // length the part was cut to.
    let walked = 0;
    const steps = 2000;
    let prev = formPoint(skin, mm(T), { x: mm(0), y: mm(0), z: mm(T / 2) });
    for (let i = 1; i <= steps; i++) {
      const p = formPoint(skin, mm(T), { x: mm((dev * i) / steps), y: mm(0), z: mm(T / 2) });
      walked += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    expect(walked).toBeCloseTo(dev, 3);
  });

  it('builds a mesh that actually curves, rather than four corners leaning over', () => {
    const flat = rectProfile(mm(872.5774), mm(720));
    const bent = formedMesh(flat, mm(T), skin);
    // Far more vertices than the flat part's 24: the subdivision is the whole point.
    expect(bent.positions.length / 3).toBeGreaterThan(200);

    let minZ = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < bent.positions.length; i += 3) {
      maxX = Math.max(maxX, bent.positions[i]!);
      minZ = Math.min(minZ, bent.positions[i + 2]!);
    }
    // The quarter turn reaches the inside radius across and down, plus the board thickness.
    expect(maxX).toBeCloseTo(INNER + T, 1);
    expect(minZ).toBeCloseTo(-INNER, 1);
  });

  it('gives the bent mesh unit normals that turn with the curve', () => {
    const bent = formedMesh(rectProfile(mm(872.5774), mm(720)), mm(T), skin);
    const seen = new Set<string>();
    for (let i = 0; i < bent.normals.length; i += 3) {
      const n = [bent.normals[i]!, bent.normals[i + 1]!, bent.normals[i + 2]!];
      expect(Math.hypot(n[0]!, n[1]!, n[2]!)).toBeCloseTo(1, 6);
      seen.add(n.map((v) => v.toFixed(2)).join(','));
    }
    // A flat panel has six distinct normals. A bent one has to have many more, or it is being
    // shaded as though it were still flat.
    expect(seen.size).toBeGreaterThan(20);
  });

  it('leaves a part with no forming alone', () => {
    // formedMesh on a shaped profile falls back rather than bending it about an axis it was
    // never designed around.
    const shelf = bowedFrontProfile(mm(900), mm(300), mm(50), 'L2');
    const viaForming = formedMesh(shelf, mm(18), skin);
    const plain = extrudeProfile(shelf, mm(18));
    expect(viaForming.positions.length).toBe(plain.positions.length);
  });
});
