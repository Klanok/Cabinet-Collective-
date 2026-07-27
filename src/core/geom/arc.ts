/**
 * Circular arcs on a profile boundary.
 *
 * A radiused shelf front, a curved former, a bent bendy-ply skin — all of them are circles,
 * and the machine has an instruction for a circle. A curve must survive from the model to the
 * post-processor as a real arc with a centre and a sweep, so Phase 4 can emit G2/G3. A curve
 * flattened to a polyline early is a curve that arrives at the machine as a run of tiny
 * straight moves, and what comes off the bed has facets you can feel with a thumbnail.
 *
 * ## How an arc is stored, and why it is stored that way
 *
 * An arc lives on the *vertex it leaves*, as a single number called the **bulge** — the DXF
 * LWPOLYLINE convention, which is also what a DXF export will want to write unchanged.
 *
 * ```
 *   bulge = tan(θ / 4)      θ = the arc's included angle, signed
 * ```
 *
 * | bulge | edge |
 * |---|---|
 * | `0` / absent | straight |
 * | `0 < b < 1` | minor arc, counter-clockwise |
 * | `b = 1` | exact semicircle, counter-clockwise |
 * | `b > 1` | major arc, counter-clockwise |
 * | negative | the same, clockwise |
 *
 * Which way that *bows* is worth stating once, because it is easy to reason out backwards.
 * Anything travelling counter-clockwise turns left, so its centre is on its **left** — and
 * therefore it bows to the **right** of the direction of travel. An outline is wound
 * counter-clockwise and its outward side is also the right of travel. So on a part outline:
 *
 * > **positive bulge = convex = material bulging out. Negative = concave = scooped in.**
 *
 * Which is the ergonomic answer, and the one to lean on: the convex front of a radiused
 * shelf is a positive bulge.
 *
 * The reason for one scalar rather than a centre and a radius is the rule this codebase is
 * built on: a centre plus a radius plus two endpoints is **four** facts describing three
 * degrees of freedom, so they can disagree, and a centre that has drifted a hundredth of a
 * millimetre off its endpoints is an arc that machines as a step. The endpoints are already
 * in the vertex ring. The bulge adds the one number that is genuinely missing, and nothing
 * else can contradict it. Centre, radius and sweep are *derived* here, every time, by
 * `arcGeometry` — the same relationship as `placementNormal` deriving w from u and v.
 *
 * Nobody types `tan(θ/4)`. Use `bulgeForSweep` or the profile constructors in `profile.ts`.
 */

import { type Mm, mm } from '../units.ts';
import { type Vec2, v2 } from './vec.ts';

/**
 * A boundary vertex. `bulge` describes the edge **leaving** this vertex for the next one.
 *
 * This extends `Vec2` rather than wrapping it, so every straight polygon ever written stays
 * valid unchanged — a vertex with no bulge is a plain point, which is what it always was.
 */
export interface Vertex2 extends Vec2 {
  /** `tan(θ/4)`, signed, positive counter-clockwise. Absent or `0` means a straight edge. */
  readonly bulge?: number;
}

/** Bulges below this are treated as straight — a 1e-9 bow over 600mm is not a curve. */
const STRAIGHT_BULGE = 1e-12;

export const isArcEdge = (v: Vertex2): boolean =>
  v.bulge !== undefined && Math.abs(v.bulge) > STRAIGHT_BULGE;

/** The bulge that sweeps through `sweepRad`, signed: positive counter-clockwise. */
export const bulgeForSweep = (sweepRad: number): number => Math.tan(sweepRad / 4);

/** The sweep, in radians, that a bulge describes. */
export const sweepForBulge = (bulge: number): number => 4 * Math.atan(bulge);

/**
 * A vertex whose outgoing edge arcs through `sweepDeg`. On a counter-clockwise outline a
 * positive sweep is **convex** — the radius on the front of a shelf. Negative is scooped in.
 */
export const arcTo = (x: number, y: number, sweepDeg: number): Vertex2 => ({
  x,
  y,
  bulge: bulgeForSweep((sweepDeg * Math.PI) / 180),
});

/**
 * Everything about an arc that the bulge implies. Derived on demand and never stored — see
 * the note at the top of the file about four facts for three degrees of freedom.
 */
export interface ArcGeometry {
  readonly centre: Vec2;
  /** Always positive. The direction of travel lives in `sweep`. */
  readonly radius: Mm;
  /** Angle from the centre to the start point, radians, `atan2` convention. */
  readonly startAngle: number;
  readonly endAngle: number;
  /** Included angle, signed. Positive counter-clockwise. */
  readonly sweep: number;
  /** Counter-clockwise from start to end. G3 rather than G2, on a machine in part space. */
  readonly ccw: boolean;
  /** Chord length, start to end. */
  readonly chord: Mm;
  /**
   * Height of the arc above the middle of its chord — what a shop actually measures off a
   * straightedge. Signed to the **right** of the direction of travel, so on a part outline a
   * positive sagitta is material bulging out.
   */
  readonly sagitta: Mm;
}

/**
 * Resolve the arc leaving `a` and arriving at `b`.
 *
 * Derivation, so the next person doesn't have to re-find it. With φ = θ/2 and chord c: the
 * half-chord subtends φ at the centre, so `r = (c/2)/sin φ`, and the centre sits on the
 * perpendicular bisector `(c/2)/tan φ` from the chord's midpoint, on the **left** of the
 * direction of travel — because anything turning counter-clockwise is turning toward its own
 * centre, and counter-clockwise turns left.
 *
 * Two cases worth checking by eye against the code. At θ = π the distance is zero and the
 * centre lands on the chord midpoint, which is the semicircle. Past θ = π, `tan φ` goes
 * negative and carries the centre through to the other side of the chord, which is what a
 * major arc needs — so the sign is handled by the arithmetic and not by a branch.
 */
export const arcGeometry = (a: Vec2, b: Vec2, bulge: number): ArcGeometry => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord === 0) {
    throw new Error('arcGeometry: an arc needs two distinct endpoints');
  }
  const sweep = sweepForBulge(bulge);
  const halfSweep = sweep / 2;
  const radius = Math.abs(chord / 2 / Math.sin(halfSweep));

  // Unit normal to the chord, pointing left of the direction of travel — the side the
  // centre of a counter-clockwise arc sits on.
  const nx = -dy / chord;
  const ny = dx / chord;

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const apothem = (chord / 2) / Math.tan(halfSweep);
  const centre = v2(midX + nx * apothem, midY + ny * apothem);

  const startAngle = Math.atan2(a.y - centre.y, a.x - centre.x);
  return {
    centre,
    radius: mm(radius),
    startAngle,
    endAngle: startAngle + sweep,
    sweep,
    ccw: sweep > 0,
    chord: mm(chord),
    sagitta: mm((bulge * chord) / 2),
  };
};

/** Arc length, `|r·θ|`. This is what a curved edge actually costs in banding. */
export const arcLength = (a: Vec2, b: Vec2, bulge: number): Mm => {
  const g = arcGeometry(a, b, bulge);
  return mm(Math.abs(g.radius * g.sweep));
};

/**
 * Area between the arc and its chord, signed to add to a counter-clockwise ring.
 *
 * `(r²/2)(θ − sin θ)` — the standard circular segment. Positive when the arc bows outward
 * from a counter-clockwise boundary, which is what makes `signedArea` come out right by
 * summing this onto the straight-line shoelace rather than by special-casing curves.
 */
export const arcSegmentArea = (a: Vec2, b: Vec2, bulge: number): number => {
  const g = arcGeometry(a, b, bulge);
  return (g.radius * g.radius * (g.sweep - Math.sin(g.sweep))) / 2;
};

/** True when `angle` lies on the arc, wrapping the way the sweep runs. */
const angleOnArc = (g: ArcGeometry, angle: number): boolean => {
  const TWO_PI = Math.PI * 2;
  if (g.sweep >= 0) {
    let d = (angle - g.startAngle) % TWO_PI;
    if (d < 0) d += TWO_PI;
    return d <= g.sweep + 1e-12;
  }
  let d = (angle - g.startAngle) % TWO_PI;
  if (d > 0) d -= TWO_PI;
  return d >= g.sweep - 1e-12;
};

/**
 * The points an arc reaches that its endpoints don't — where it crosses due east, north,
 * west or south of its centre.
 *
 * This is why a bounding box cannot be read off the vertices once curves exist. A shelf with
 * a bowed front is deeper at the middle than at either end, and the middle is the figure that
 * has to fit on the sheet. Getting this wrong under-reports the part size, which is a nest
 * that doesn't fit and a sheet you've already cut.
 */
export const arcExtremePoints = (a: Vec2, b: Vec2, bulge: number): Vec2[] => {
  const g = arcGeometry(a, b, bulge);
  const candidates: { angle: number; point: Vec2 }[] = [
    { angle: 0, point: v2(g.centre.x + g.radius, g.centre.y) },
    { angle: Math.PI / 2, point: v2(g.centre.x, g.centre.y + g.radius) },
    { angle: Math.PI, point: v2(g.centre.x - g.radius, g.centre.y) },
    { angle: -Math.PI / 2, point: v2(g.centre.x, g.centre.y - g.radius) },
  ];
  return candidates.filter((c) => angleOnArc(g, c.angle)).map((c) => c.point);
};

/**
 * How far a straight chord may stray from the true curve when an arc has to be drawn as
 * segments. Rendering only — nothing dimensional flattens.
 *
 * 0.05mm is well under what anyone can see on screen and an order of magnitude under what a
 * shop measures, while keeping a 300mm radius down to a couple of dozen segments.
 */
export const FLATTEN_TOLERANCE: Mm = mm(0.05);

/**
 * Points along an arc, excluding `a` and including `b`, fine enough that no chord strays
 * further than `tolerance` from the true curve.
 *
 * Each returned point carries the **outward radial normal** at that point, because a curved
 * edge that is shaded with one flat normal per facet reads as a row of flats. The normal is
 * exact even though the position is approximated, so the curve looks round at any segment
 * count.
 */
export interface FlatPoint {
  readonly at: Vec2;
  /** Unit outward normal of the boundary here — radial for an arc, absent on a straight run. */
  readonly normal?: Vec2;
}

export const flattenArc = (
  a: Vec2,
  b: Vec2,
  bulge: number,
  tolerance: Mm = FLATTEN_TOLERANCE,
): FlatPoint[] => {
  const g = arcGeometry(a, b, bulge);
  const absSweep = Math.abs(g.sweep);

  // The sagitta of one segment spanning angle α is r(1 − cos(α/2)); solve that for α at the
  // tolerance, then use however many whole segments covers the sweep.
  const maxStep =
    g.radius <= tolerance ? absSweep : 2 * Math.acos(Math.max(-1, 1 - tolerance / g.radius));
  const steps = Math.max(1, Math.ceil(absSweep / Math.max(maxStep, 1e-6)));

  // On a counter-clockwise outline a positive sweep is the convex case, so the surface faces
  // away from the centre. A negative sweep is a scooped edge and faces back toward it.
  const outward = g.sweep >= 0 ? 1 : -1;

  const points: FlatPoint[] = [];
  for (let i = 1; i <= steps; i++) {
    const angle = g.startAngle + (g.sweep * i) / steps;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    points.push({
      // The last point is the stored endpoint verbatim, never a re-derived one: a curved edge
      // must close on exactly the vertex the next edge starts from.
      at: i === steps ? v2(b.x, b.y) : v2(g.centre.x + g.radius * cos, g.centre.y + g.radius * sin),
      normal: v2(outward * cos, outward * sin),
    });
  }
  return points;
};

/** The outward radial normal at the *start* of an arc — the first facet's normal at its base. */
export const arcStartNormal = (a: Vec2, b: Vec2, bulge: number): Vec2 => {
  const g = arcGeometry(a, b, bulge);
  const outward = g.sweep >= 0 ? 1 : -1;
  return v2(outward * Math.cos(g.startAngle), outward * Math.sin(g.startAngle));
};
