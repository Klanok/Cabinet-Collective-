/**
 * 2D panel profiles.
 *
 * A panel's shape is an outline polygon plus optional interior holes, living in part space
 * (X = length, Y = width — see docs/coordinate-convention.md). Extruding this to thickness
 * gives the solid; there is no BREP kernel and there is not meant to be one.
 *
 * An edge between two vertices may be a **circular arc** — see `geom/arc.ts` for how one is
 * stored and why. Everything in this file that measures a profile handles arcs exactly rather
 * than by flattening first: an arc's true length is what a curved edge costs in banding, and
 * its true extent is what has to fit on the sheet. Flattening happens once, at the point of
 * drawing, and nowhere else.
 *
 * Note what is *not* here: hinge cups, shelf-pin lines, grooves. Those are parametric
 * features attached to the panel (see model/feature.ts), deliberately not baked into this
 * geometry, so the CAM layer can read them as machining operations rather than trying to
 * recover intent from a mesh.
 */

import { type Mm, type Mm2, mm, snapGeometric } from '../units.ts';
import { type Vec2, v2 } from './vec.ts';
import {
  type Vertex2,
  FLATTEN_TOLERANCE,
  arcExtremePoints,
  arcLength,
  arcSegmentArea,
  arcStartNormal,
  flattenArc,
  isArcEdge,
} from './arc.ts';

export type { Vertex2 } from './arc.ts';

/**
 * A closed ring. First vertex is not repeated at the end.
 *
 * A vertex is a `Vec2` that may additionally carry a `bulge` for the edge leaving it, so
 * every straight polygon written before curves existed is still a valid one.
 */
export type Polygon = readonly Vertex2[];

export interface Profile2D {
  /** Outer boundary, counter-clockwise. */
  readonly outline: Polygon;
  /** Interior holes, clockwise. Empty for the overwhelming majority of cabinet parts. */
  readonly holes: readonly Polygon[];
}

/** True when any edge of the outline or a hole is an arc. */
export const profileHasArcs = (p: Profile2D): boolean =>
  p.outline.some(isArcEdge) || p.holes.some((h) => h.some(isArcEdge));

/**
 * The four edges of a rectangular panel, using the cutlist naming a joiner actually uses.
 * L-edges run along the length (part-space X), W-edges along the width (part-space Y).
 */
export type RectEdge = 'L1' | 'L2' | 'W1' | 'W2';

export const RECT_EDGES: readonly RectEdge[] = ['L1', 'L2', 'W1', 'W2'];

/** Which side of the part-space bounding box each named edge sits on. */
export const RECT_EDGE_POSITION: Record<RectEdge, 'y=0' | 'y=width' | 'x=0' | 'x=length'> = {
  L1: 'y=0',
  L2: 'y=width',
  W1: 'x=0',
  W2: 'x=length',
};

export const rectProfile = (length: Mm, width: Mm): Profile2D => ({
  outline: [v2(0, 0), v2(length, 0), v2(length, width), v2(0, width)],
  holes: [],
});

/**
 * A rectangle with a rectangular bite taken out of one corner — scribe notches, notches
 * around a stud or a service, back-panel cutouts that break the perimeter.
 */
export type Corner = 'x0y0' | 'x1y0' | 'x1y1' | 'x0y1';

export const notchedRectProfile = (
  length: Mm,
  width: Mm,
  corner: Corner,
  notchLength: Mm,
  notchWidth: Mm,
): Profile2D => {
  if (notchLength <= 0 || notchWidth <= 0) return rectProfile(length, width);
  if (notchLength >= length || notchWidth >= width) {
    throw new Error(
      `notchedRectProfile: notch ${notchLength}×${notchWidth} does not fit in ${length}×${width}`,
    );
  }
  const l = length;
  const w = width;
  const nl = notchLength;
  const nw = notchWidth;

  // Each case walks the boundary counter-clockwise from the origin corner.
  const outline: Record<Corner, Polygon> = {
    x0y0: [v2(nl, 0), v2(l, 0), v2(l, w), v2(0, w), v2(0, nw), v2(nl, nw)],
    x1y0: [v2(0, 0), v2(l - nl, 0), v2(l - nl, nw), v2(l, nw), v2(l, w), v2(0, w)],
    x1y1: [v2(0, 0), v2(l, 0), v2(l, w - nw), v2(l - nl, w - nw), v2(l - nl, w), v2(0, w)],
    x0y1: [v2(0, 0), v2(l, 0), v2(l, w), v2(nl, w), v2(nl, w - nw), v2(0, w - nw)],
  };
  return { outline: outline[corner], holes: [] };
};

/**
 * The radius of an arc that spans `chord` and stands `sagitta` proud of it at the middle.
 *
 * `r = (c²/4 + s²) / 2s`, straight from the intersecting-chords theorem. This is the
 * conversion a shop actually needs, because nobody measures a radius on a shelf front —
 * they measure how far it bows over how wide, which is what a straightedge and a tape give.
 */
export const radiusFromChordAndSagitta = (chord: Mm, sagitta: Mm): Mm => {
  if (sagitta <= 0) throw new Error('radiusFromChordAndSagitta: a flat edge has no radius');
  return mm((chord * chord) / 4 / (2 * sagitta) + sagitta / 2);
};

/** The included angle of an arc of `radius` spanning `chord`. Positive, in radians. */
export const sweepFromChordAndRadius = (chord: Mm, radius: Mm): number => {
  const ratio = chord / (2 * radius);
  if (ratio > 1) {
    throw new Error(
      `sweepFromChordAndRadius: a ${radius}mm radius cannot span a ${chord}mm chord — ` +
        `the tightest possible is a semicircle at ${2 * radius}mm`,
    );
  }
  return 2 * Math.asin(ratio);
};

/**
 * A rectangle with one long edge bowed out into a circular arc — the open radiused shelf.
 *
 * `length` × `depth` is the rectangle at the **ends** of the shelf; `sagitta` is how much
 * further the middle of the front reaches. That is how the curve gets described and how it
 * gets checked — a straightedge across the front and a tape to the middle — so it is what
 * gets typed, and the radius follows from it rather than the other way round.
 *
 * The part is `depth + sagitta` deep at its deepest, and that, not `depth`, is what has to
 * fit on the sheet. `profileExtent` already knows.
 *
 * `frontEdge` says which named edge bows, and there is no default on purpose. Which part-space
 * edge faces the front of a cabinet depends on the panel's placement: a shelf laid in with
 * `v = −Z` has its front on **L1**, and a caller that assumed L2 would put the curve on the
 * back of the shelf, against the wall, where it would look perfectly fine in a unit test.
 * This is the same handedness trap `resolveBanding` exists to avoid, so it is made explicit
 * the same way.
 */
export const bowedFrontProfile = (
  length: Mm,
  depth: Mm,
  sagitta: Mm,
  frontEdge: 'L1' | 'L2',
): Profile2D => {
  if (sagitta === 0) return rectProfile(length, depth);
  if (sagitta < 0) throw new Error('bowedFrontProfile: a front bows out, so sagitta is positive');
  if (sagitta >= depth) {
    throw new Error(
      `bowedFrontProfile: a ${sagitta}mm bow on a ${depth}mm shelf reaches past the back of it`,
    );
  }
  const bulge = (2 * sagitta) / length;

  if (frontEdge === 'L2') {
    // The front runs from (length, depth) to (0, depth) — travelling −X, whose right-hand
    // side is +Y. A positive bulge is therefore the convex, bowed-forward case.
    return {
      outline: [v2(0, 0), v2(length, 0), { x: length, y: depth, bulge }, v2(0, depth)],
      holes: [],
    };
  }

  // Bowing the y = 0 edge pushes it below the origin, and part space starts at the corner of
  // the bounding box — so the whole rectangle is lifted by the bow and the curve comes back
  // down to y = 0 at its middle. The front runs +X, whose right-hand side is −Y.
  const s = sagitta;
  return {
    outline: [
      { x: 0, y: s, bulge },
      v2(length, s),
      v2(length, s + depth),
      v2(0, s + depth),
    ],
    holes: [],
  };
};

/**
 * A quarter disc — the plan shape of a former in a radiused end.
 *
 * Occupies the corner at the origin: straight along `y = 0` out to the radius, round to the
 * radius on `x = 0`, and back down. The curve is the outside of the cabinet.
 */
export const quarterDiscProfile = (radius: Mm): Profile2D => {
  if (radius <= 0) throw new Error('quarterDiscProfile: radius must be positive');
  // From (r,0) to (0,r) the right-hand side of travel points away from the origin, so a
  // positive bulge is the convex quarter. tan(90°/4) = tan 22.5°.
  return {
    outline: [v2(0, 0), { x: radius, y: 0, bulge: Math.tan(Math.PI / 8) }, v2(0, radius)],
    holes: [],
  };
};

// ---------------------------------------------------------------------------------------
// Measuring a ring
// ---------------------------------------------------------------------------------------

/** One boundary edge, resolved: where it runs and whether it bows. */
export interface ProfileEdge {
  readonly from: Vec2;
  readonly to: Vec2;
  /** 0 for a straight edge. */
  readonly bulge: number;
  /** True length — the arc, not the chord. */
  readonly length: Mm;
  /** Index of `from` within the ring. */
  readonly index: number;
}

export const polygonEdges = (poly: Polygon): ProfileEdge[] => {
  const n = poly.length;
  const edges: ProfileEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const curved = isArcEdge(a);
    edges.push({
      from: a,
      to: b,
      bulge: curved ? a.bulge! : 0,
      length: curved ? arcLength(a, b, a.bulge!) : mm(Math.hypot(b.x - a.x, b.y - a.y)),
      index: i,
    });
  }
  return edges;
};

/**
 * Signed area, positive for counter-clockwise winding.
 *
 * The straight-line shoelace over the vertices, plus the circular segment each arc adds
 * between itself and its chord. Signing the segments to match the winding is what lets the
 * two be summed rather than the curve needing a case of its own — and it means a full circle
 * written as two semicircular edges comes out at exactly πr².
 */
export const signedArea = (poly: Polygon): Mm2 => {
  let acc = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    acc += a.x * b.y - b.x * a.y;
  }
  let area = acc / 2;
  for (const e of polygonEdges(poly)) {
    if (e.bulge !== 0) area += arcSegmentArea(e.from, e.to, e.bulge);
  }
  return area;
};

/** True material area, holes removed. This is what costing charges for. */
export const profileArea = (p: Profile2D): Mm2 =>
  Math.abs(signedArea(p.outline)) - p.holes.reduce((sum, h) => sum + Math.abs(signedArea(h)), 0);

/** Length all the way round, following each arc rather than cutting across it. */
export const polygonPerimeter = (poly: Polygon): Mm =>
  mm(polygonEdges(poly).reduce((sum, e) => sum + e.length, 0));

export interface Bounds2 {
  readonly minX: Mm;
  readonly minY: Mm;
  readonly maxX: Mm;
  readonly maxY: Mm;
}

/**
 * Every point that can set the extent of a ring: the vertices, plus wherever an arc reaches
 * past both of its endpoints.
 *
 * A shelf bowed 40mm out at the middle of its front is 40mm deeper than its corners say it
 * is. Reading the box off the vertices alone would under-report the part, and an
 * under-reported part is one that doesn't fit the sheet it was nested onto.
 */
const boundingPoints = (poly: Polygon): Vec2[] => {
  const points: Vec2[] = poly.map((v) => v2(v.x, v.y));
  for (const e of polygonEdges(poly)) {
    if (e.bulge !== 0) points.push(...arcExtremePoints(e.from, e.to, e.bulge));
  }
  return points;
};

export const profileBounds = (p: Profile2D): Bounds2 => {
  const points = boundingPoints(p.outline);
  const xs = points.map((v) => v.x);
  const ys = points.map((v) => v.y);
  // Snapped because an arc's extreme is found through a centre and a radius rather than read
  // off a stored vertex, and comes back a fraction of a nanometre out. See `snapGeometric`.
  return {
    minX: snapGeometric(Math.min(...xs)),
    minY: snapGeometric(Math.min(...ys)),
    maxX: snapGeometric(Math.max(...xs)),
    maxY: snapGeometric(Math.max(...ys)),
  };
};

/** Bounding-box size. This is the size a saw or a nester cares about, not the true area. */
export const profileExtent = (p: Profile2D): { length: Mm; width: Mm } => {
  const b = profileBounds(p);
  return { length: mm(b.maxX - b.minX), width: mm(b.maxY - b.minY) };
};

export const isRectangular = (p: Profile2D): boolean => {
  if (p.holes.length > 0 || p.outline.length !== 4) return false;
  if (p.outline.some(isArcEdge)) return false;
  const b = profileBounds(p);
  return p.outline.every(
    (v) => (v.x === b.minX || v.x === b.maxX) && (v.y === b.minY || v.y === b.maxY),
  );
};

// ---------------------------------------------------------------------------------------
// Naming the sides of a part
// ---------------------------------------------------------------------------------------

/**
 * Total true length of the boundary on each named side.
 *
 * Banding is specified per side — "band the front edge" — so a part needs to say how long
 * each of its sides is. On a rectangle that is just the bounding box, which is what this used
 * to return. On anything else it isn't, and on a **curved** part it is not even close: the
 * front of a shelf bowed 40mm out over 900mm is about 902mm of banding, and charging the
 * 900mm chord quietly under-buys the tape.
 *
 * Each boundary edge is assigned to a side by the direction it runs and which half of the
 * part it runs through — an edge mostly along X below the centroid is on L1, and so on. That
 * reproduces the bounding box exactly for a rectangle *and* for a notched rectangle (the two
 * pieces of a broken side sum back to the full length), so nothing straight changes; it is
 * only curves that were ever measured wrongly.
 *
 * An arc is assigned as a whole, by its chord, because a side is a side even when it bows.
 *
 * Two honest limits. An edge running at exactly 45° could be called either, and falls to the
 * L side; and a part with fewer than four sides — a quarter disc former — leaves one of the
 * four names measuring zero, which is correct in that there is no such edge to band. Both
 * only matter to a part that is banded on the edge in question, and neither is true of
 * anything built today.
 */
export const profileEdgeLengths = (p: Profile2D): Record<RectEdge, Mm> => {
  const totals: Record<RectEdge, number> = { L1: 0, L2: 0, W1: 0, W2: 0 };
  const b = profileBounds(p);
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;

  for (const e of polygonEdges(p.outline)) {
    const dx = e.to.x - e.from.x;
    const dy = e.to.y - e.from.y;
    if (dx === 0 && dy === 0) continue;
    const alongX = Math.abs(dx) >= Math.abs(dy);
    if (alongX) {
      totals[(e.from.y + e.to.y) / 2 < midY ? 'L1' : 'L2'] += e.length;
    } else {
      totals[(e.from.x + e.to.x) / 2 < midX ? 'W1' : 'W2'] += e.length;
    }
  }
  return { L1: mm(totals.L1), L2: mm(totals.L2), W1: mm(totals.W1), W2: mm(totals.W2) };
};

// ---------------------------------------------------------------------------------------
// Flattening — for drawing, and only for drawing
// ---------------------------------------------------------------------------------------

/**
 * One straight piece of a flattened boundary, with the **true** surface normal at each end.
 *
 * The normals are carried per segment-end rather than per point on purpose. A point where an
 * arc meets a straight run is one position with two different surface directions — round on
 * one side, flat on the other — and a single normal stored against it would have to be wrong
 * for one of them. Splitting it lets a curve shade smoothly along its length and still break
 * crisply where it stops being a curve.
 */
export interface FlatSegment {
  readonly a: Vec2;
  readonly b: Vec2;
  /** Unit outward normal at `a`. */
  readonly na: Vec2;
  /** Unit outward normal at `b`. Equal to `na` on a straight edge. */
  readonly nb: Vec2;
}

/**
 * A ring as straight segments, fine enough that no chord strays further than `tolerance`
 * from the true curve.
 *
 * Nothing dimensional calls this. Areas, perimeters, extents and banding are all computed
 * from the exact arc above, so a flattened ring never becomes the thing a part is cut to.
 * This exists so a triangulator and a renderer have vertices to work with, and so that the
 * decision to approximate is made in one visible place. The CAM layer must not call it
 * either — an arc reaches the machine as an arc.
 */
export const flattenPolygonSegments = (
  poly: Polygon,
  tolerance: Mm = FLATTEN_TOLERANCE,
): FlatSegment[] => {
  const out: FlatSegment[] = [];
  for (const e of polygonEdges(poly)) {
    if (e.bulge === 0) {
      const len = Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y);
      if (len === 0) continue;
      // Outward normal of a counter-clockwise ring is the right of travel.
      const n = v2((e.to.y - e.from.y) / len, -(e.to.x - e.from.x) / len);
      out.push({ a: v2(e.from.x, e.from.y), b: v2(e.to.x, e.to.y), na: n, nb: n });
      continue;
    }
    let at: Vec2 = v2(e.from.x, e.from.y);
    let normal: Vec2 = arcStartNormal(e.from, e.to, e.bulge);
    for (const step of flattenArc(e.from, e.to, e.bulge, tolerance)) {
      out.push({ a: at, b: step.at, na: normal, nb: step.normal! });
      at = step.at;
      normal = step.normal!;
    }
  }
  return out;
};

/** Just the ring of points, for a triangulator that doesn't care about shading. */
export const flattenPolygonPoints = (poly: Polygon, tolerance: Mm = FLATTEN_TOLERANCE): Vec2[] =>
  flattenPolygonSegments(poly, tolerance).map((s) => s.a);
