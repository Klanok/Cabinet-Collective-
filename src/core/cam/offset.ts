/**
 * Offsetting a part outline by the cutter's radius.
 *
 * A router does not cut on its centreline. To leave a part its stated size the tool has to run a
 * radius outside it, and getting that wrong does not produce a slightly wrong part — it produces
 * one 6mm undersize on every edge, which is a whole sheet.
 *
 * **This is computed here rather than left to the machine.** Every controller has cutter
 * compensation (G41/G42) and every controller implements it slightly differently: when it engages,
 * what it does on the first move, how it behaves at a corner sharper than the tool. A compensation
 * bug is a crash or a gouge, it happens at the machine rather than on screen, and it is invisible
 * to any test that can be written here. An offset computed in the model is geometry, and geometry
 * can be asserted — `tests/cam.test.ts` checks that the offset of a 500×300 rectangle with a 6mm
 * cutter is 512×312, which is a thing a person can check in their head.
 *
 * ## What an offset does to each kind of edge
 *
 * The ring is counter-clockwise, so the material is on the **left** of travel and outward is the
 * **right**. Each edge moves `r` to its right:
 *
 *   - **a straight edge** moves parallel to itself.
 *   - **a convex arc** (positive bulge — the front of a bowed shelf) keeps its centre and its
 *     sweep, and its radius grows by `r`.
 *   - **a concave arc** (negative bulge — a scoop) keeps its centre and its sweep, and its radius
 *     *shrinks* by `r`. A cutter bigger than the scoop cannot cut it, and that is reported.
 *
 * A bulge is `tan(sweep/4)` and the sweep never changes, so **the bulge is carried across
 * untouched in both cases**. Only the endpoints move. That is a pleasant consequence of storing the
 * one non-redundant number rather than a centre and a radius (§2), and it is worth noticing: an
 * offset written against a stored centre would have had to move the centre, or not, depending on
 * which way the arc bowed.
 *
 * ## What it does at each corner
 *
 *   - **convex** (the outline turns left) — the two offset edges pull apart, and the tool swings
 *     round the original corner. Joined with an arc of radius `r` centred on that corner. This is
 *     why a part cut on a router has slightly rounded outside corners, which nobody notices.
 *   - **concave** (the outline turns right — the inside corner of a notch) — the two offset edges
 *     cross, and the path runs to their intersection. **The corner comes out with the cutter's own
 *     radius in it, not square**, because a round tool cannot cut a sharp internal corner. That is
 *     physics rather than a limitation of this code, and it is worth telling whoever expected a
 *     square notch.
 */

import { type Mm, GEOMETRIC_EPSILON, mm } from '../units.ts';
import { type Vec2, v2 } from '../geom/vec.ts';
import { type Vertex2, arcGeometry, bulgeForSweep, isArcEdge } from '../geom/arc.ts';

export interface OffsetResult {
  readonly path: readonly Vertex2[];
  /** Anything the cutter physically cannot do. Empty on every part in the shipped kitchen. */
  readonly problems: readonly string[];
}

interface OffsetEdge {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly bulge: number;
}

/** Unit direction from `a` to `b`, and the right-hand normal — which on a CCW ring points out. */
const outwardNormal = (a: Vec2, b: Vec2): Vec2 | null => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= GEOMETRIC_EPSILON) return null;
  return v2(dy / len, -dx / len);
};

/** Where the outgoing direction of an arc points, at each of its ends. */
const arcTangents = (a: Vec2, b: Vec2, bulge: number): { start: Vec2; end: Vec2 } => {
  const g = arcGeometry(a, b, bulge);
  // The tangent of a circle is perpendicular to its radius, turned the way the arc sweeps.
  const turn = g.ccw ? 1 : -1;
  const at = (angle: number): Vec2 =>
    v2(-Math.sin(angle) * turn, Math.cos(angle) * turn);
  return { start: at(g.startAngle), end: at(g.endAngle) };
};

/** The outward normal at each end of an edge — a straight edge has one, an arc has two. */
const edgeNormals = (a: Vec2, b: Vec2, bulge: number): { start: Vec2; end: Vec2 } | null => {
  if (bulge === 0) {
    const n = outwardNormal(a, b);
    return n && { start: n, end: n };
  }
  const t = arcTangents(a, b, bulge);
  const right = (d: Vec2): Vec2 => v2(d.y, -d.x);
  return { start: right(t.start), end: right(t.end) };
};

/** Intersection of two infinite lines, each given as a point and a direction. Null if parallel. */
const lineIntersection = (p: Vec2, dp: Vec2, q: Vec2, dq: Vec2): Vec2 | null => {
  const denom = dp.x * dq.y - dp.y * dq.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((q.x - p.x) * dq.y - (q.y - p.y) * dq.x) / denom;
  return v2(p.x + dp.x * t, p.y + dp.y * t);
};

/**
 * Offset a closed counter-clockwise ring outward by `radius`.
 *
 * Two passes, because they answer different questions: move every edge, then decide what happens
 * where two moved edges meet. Doing it in one pass is how a corner ends up joined to the edge
 * before last.
 */
export const offsetRingOutward = (
  ring: readonly Vertex2[],
  radius: Mm,
): OffsetResult => {
  const problems: string[] = [];
  if (radius <= GEOMETRIC_EPSILON) return { path: ring, problems };
  const n = ring.length;
  if (n < 3) return { path: ring, problems: ['A path with fewer than three corners cannot be offset.'] };

  // ── Pass one: every edge moves to its right ──────────────────────────────────────────────
  const edges: OffsetEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const bulge = isArcEdge(a) ? a.bulge! : 0;
    const normals = edgeNormals(a, b, bulge);
    if (!normals) continue; // zero-length edge; nothing to offset

    if (bulge === 0) {
      edges.push({
        from: v2(a.x + normals.start.x * radius, a.y + normals.start.y * radius),
        to: v2(b.x + normals.end.x * radius, b.y + normals.end.y * radius),
        bulge: 0,
      });
      continue;
    }

    // An arc keeps its centre and its sweep; only its radius changes. Growing for a convex arc,
    // shrinking for a concave one — and a cutter wider than a concave arc cannot enter it.
    const g = arcGeometry(a, b, bulge);
    const concave = bulge < 0;
    if (concave && g.radius <= radius + GEOMETRIC_EPSILON) {
      problems.push(
        `A ${(radius * 2).toFixed(1)}mm cutter cannot follow a ${g.radius.toFixed(1)}mm ` +
          `internal radius — it needs to be smaller than the curve it cuts into.`,
      );
    }
    edges.push({
      from: v2(a.x + normals.start.x * radius, a.y + normals.start.y * radius),
      to: v2(b.x + normals.end.x * radius, b.y + normals.end.y * radius),
      bulge,
    });
  }

  if (edges.length < 3) return { path: ring, problems };

  // ── Pass two: join them ──────────────────────────────────────────────────────────────────
  const path: Vertex2[] = [];
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i]!;
    const next = edges[(i + 1) % edges.length]!;
    const corner = ring[(i + 1) % n]!;

    path.push(edge.bulge === 0 ? v2(edge.from.x, edge.from.y) : { ...edge.from, bulge: edge.bulge });

    const gap = Math.hypot(next.from.x - edge.to.x, next.from.y - edge.to.y);
    if (gap <= GEOMETRIC_EPSILON) continue; // tangent — the edges already meet

    // Which way does the outline turn here? Compare the two outward normals: the cross product
    // is positive when the second is to the left of the first, which is a convex (left) turn.
    const inN = v2(edge.to.x - corner.x, edge.to.y - corner.y);
    const outN = v2(next.from.x - corner.x, next.from.y - corner.y);
    const cross = inN.x * outN.y - inN.y * outN.x;

    if (cross > GEOMETRIC_EPSILON) {
      // Convex: swing the tool around the corner on an arc of its own radius. The sweep is the
      // angle between the two normals, and a left turn is counter-clockwise, so it is positive.
      const dot = (inN.x * outN.x + inN.y * outN.y) / (radius * radius);
      const sweep = Math.acos(Math.max(-1, Math.min(1, dot)));
      path.push({ ...edge.to, bulge: bulgeForSweep(sweep) });
      continue;
    }

    // Concave: the two offset edges cross. Run to where they meet. Both edges are straight in
    // every profile this codebase produces; an arc into a concave corner is reported rather than
    // approximated, because a wrong guess there cuts into the part.
    if (edge.bulge !== 0 || next.bulge !== 0) {
      problems.push(
        'An internal corner between two curved edges is not offset — check this part by hand.',
      );
      path.push(v2(edge.to.x, edge.to.y));
      continue;
    }
    const meeting = lineIntersection(
      edge.from,
      v2(edge.to.x - edge.from.x, edge.to.y - edge.from.y),
      next.from,
      v2(next.to.x - next.from.x, next.to.y - next.from.y),
    );
    path.push(meeting ? v2(meeting.x, meeting.y) : v2(edge.to.x, edge.to.y));
  }

  return { path, problems };
};

/** Radius of a straight-sided cutter, which is the only kind a part is cut out with. */
export const cutterRadius = (diameter: Mm): Mm => mm(diameter / 2);
