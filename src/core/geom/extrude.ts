/**
 * Profile → solid. The entire "3D kernel", and deliberately so: cabinet parts are flat
 * panels, so extruding a 2D profile to thickness covers essentially all of them at a
 * fraction of the complexity of a general BREP kernel.
 *
 * Output is plain typed arrays. Nothing here imports Three.js — the viewport adapts this,
 * not the other way round, so geometry stays testable in Node.
 */

import type { Mm } from '../units.ts';
import {
  type Polygon,
  type Profile2D,
  flattenPolygonPoints,
  flattenPolygonSegments,
  signedArea,
} from './profile.ts';
import { type Vec2, v2 } from './vec.ts';

export interface MeshData {
  /** xyz triples, in part space. */
  readonly positions: Float32Array;
  /** xyz triples, one per position. */
  readonly normals: Float32Array;
  /** Flat part-space xy pairs, in millimetres. The viewport scales these for each decor. */
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

const cross2 = (o: Vec2, a: Vec2, b: Vec2): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Two points close enough to be the same corner. Well under anything a shop measures. */
const samePoint = (a: Vec2, b: Vec2): boolean =>
  Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

const pointInTriangle = (p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean => {
  const d1 = cross2(a, b, p);
  const d2 = cross2(b, c, p);
  const d3 = cross2(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
};

/**
 * Ear-clipping triangulation of a simple polygon. Returns index triples into `poly`.
 *
 * Handles the non-convex outlines cabinet work actually produces (scribe notches, sink
 * cutouts that break the perimeter). Interior holes are not triangulated — see
 * `extrudeProfile`.
 *
 * Takes the ring **as given** and treats every edge as straight, because it returns indices
 * into that ring and could not do so if it subdivided. A ring with arcs on it must be put
 * through `flattenPolygonSegments` first, which is what `extrudeProfile` does.
 */
export const triangulatePolygon = (poly: Polygon): number[] => {
  const n = poly.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  // Work counter-clockwise so the ear test has a consistent sign.
  const ccw = signedArea(poly) > 0;
  const indices = Array.from({ length: n }, (_, i) => (ccw ? i : n - 1 - i));

  const triangles: number[] = [];
  let guard = 0;
  const maxIterations = n * n;

  while (indices.length > 3) {
    if (guard++ > maxIterations) {
      // Self-intersecting or degenerate input. Bail with what we have rather than spin.
      break;
    }
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const iPrev = indices[(i + indices.length - 1) % indices.length]!;
      const iCurr = indices[i]!;
      const iNext = indices[(i + 1) % indices.length]!;
      const a = poly[iPrev]!;
      const b = poly[iCurr]!;
      const c = poly[iNext]!;

      if (cross2(a, b, c) <= 0) continue; // reflex or collinear — not an ear

      const containsOther = indices.some((idx) => {
        if (idx === iPrev || idx === iCurr || idx === iNext) return false;
        const p = poly[idx]!;
        // A vertex sitting exactly on a corner of the candidate ear is not inside it. This is
        // not a nicety: bridging a hole into an outline duplicates two vertices by
        // construction (see `bridgeHoles`), and `pointInTriangle` counts a boundary point as
        // contained — so without this the clipper finds no ear at all and gives up with the
        // cap half triangulated.
        if (samePoint(p, a) || samePoint(p, b) || samePoint(p, c)) return false;
        return pointInTriangle(p, a, b, c);
      });
      if (containsOther) continue;

      triangles.push(iPrev, iCurr, iNext);
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // no ear found — degenerate polygon
  }

  if (indices.length === 3) triangles.push(indices[0]!, indices[1]!, indices[2]!);
  return triangles;
};

/**
 * Whether the segment `a`–`b` crosses any edge of `ring`, ends excluded.
 *
 * Used to pick a bridge that does not cut through the shape it is joining. Straight-line only,
 * which is why `bridgeHoles` works on already-flattened rings.
 */
const segmentsCross = (a: Vec2, b: Vec2, ring: readonly Vec2[]): boolean => {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const c = ring[i]!;
    const d = ring[(i + 1) % n]!;
    if (samePoint(c, a) || samePoint(c, b) || samePoint(d, a) || samePoint(d, b)) continue;
    const d1 = cross2(a, b, c);
    const d2 = cross2(a, b, d);
    const d3 = cross2(c, d, a);
    const d4 = cross2(c, d, b);
    if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return true;
  }
  return false;
};

/**
 * Splice every hole into the outline with a two-way bridge, giving one simple ring an
 * ear-clipper can chew.
 *
 * This is the standard trick and it is worth knowing it is a trick: the merged ring walks out
 * along the bridge, all the way round the hole, and back down the same bridge, so the two bridge
 * edges lie on top of each other and enclose no area. That is why `triangulatePolygon` has to
 * treat a coincident vertex as not-contained, and why the hole rings must be wound **opposite**
 * to the outline — which is the convention `Profile2D` already states.
 *
 * A hole with no visible bridge is **left out rather than forced**. It only happens on shapes
 * this codebase does not produce, and half a triangulated cap is a panel with a corner missing
 * on screen, which reads as a modelling failure rather than as a missing hole.
 */
const bridgeHoles = (outline: readonly Vec2[], holes: readonly (readonly Vec2[])[]): Vec2[] => {
  let ring: Vec2[] = outline.map((p) => v2(p.x, p.y));
  // Rightmost hole first: its bridge runs through the least remaining material, so an earlier
  // bridge cannot fence a later hole in.
  const ordered = [...holes]
    .filter((h) => h.length >= 3)
    .sort((a, b) => Math.max(...b.map((p) => p.x)) - Math.max(...a.map((p) => p.x)));

  for (const hole of ordered) {
    let m = 0;
    for (let i = 1; i < hole.length; i++) if (hole[i]!.x > hole[m]!.x) m = i;
    const bridgeFrom = hole[m]!;

    // The nearest outline vertex the bridge can reach without crossing the outline, this hole,
    // or anything already bridged in. Nearest keeps the sliver short and well-conditioned.
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const candidate = ring[i]!;
      const distance = Math.hypot(candidate.x - bridgeFrom.x, candidate.y - bridgeFrom.y);
      if (distance >= bestDistance) continue;
      if (segmentsCross(bridgeFrom, candidate, ring)) continue;
      if (segmentsCross(bridgeFrom, candidate, hole)) continue;
      best = i;
      bestDistance = distance;
    }
    if (best < 0) continue;

    const rotated = [...hole.slice(m), ...hole.slice(0, m)].map((p) => v2(p.x, p.y));
    ring = [
      ...ring.slice(0, best + 1),
      ...rotated,
      v2(rotated[0]!.x, rotated[0]!.y),
      v2(ring[best]!.x, ring[best]!.y),
      ...ring.slice(best + 1),
    ];
  }
  return ring;
};

/**
 * Extrude a profile from z=0 (B-face) to z=thickness (A-face), in part space.
 *
 * **Interior holes are cut out**, both faces and the wall down through the board. That is newer
 * than the rest of this file and is what lets a custom hole through a panel (§5.12) show up as a
 * hole rather than as a dark disc drawn on a solid one — a cabinetmaker checking a waste-pipe
 * cutout on screen is checking whether he can see the wall behind it.
 *
 * A hole ring is wound clockwise against the outline's counter-clockwise, which is `Profile2D`'s
 * own convention, and it is what makes the bridge below produce a simple ring.
 */
export const extrudeProfile = (profile: Profile2D, thickness: Mm): MeshData => {
  // Curves become segments here and only here. Everything dimensional — the cutlist, the
  // banding length, the sheet the part has to fit on — is measured off the exact arc
  // upstream, so this approximation never escapes into what gets cut.
  // Wrapped rather than passed by reference: `map` hands its callback the *index* as a second
  // argument, which `flattenPolygonPoints` would read as a flattening tolerance of zero — and a
  // zero tolerance asks for a circle in six million segments.
  const holeRings = profile.holes.map((h) => flattenPolygonPoints(h));
  const capRing = bridgeHoles(flattenPolygonPoints(profile.outline), holeRings);
  const walls = [
    ...flattenPolygonSegments(profile.outline),
    ...profile.holes.flatMap((h) => flattenPolygonSegments(h)),
  ];
  const capTris = triangulatePolygon(capRing);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // A-face (z = thickness), normal +Z.
  const aBase = positions.length / 3;
  for (const p of capRing) {
    positions.push(p.x, p.y, thickness);
    normals.push(0, 0, 1);
    uvs.push(p.x, p.y);
  }
  for (let i = 0; i < capTris.length; i += 3) {
    indices.push(aBase + capTris[i]!, aBase + capTris[i + 1]!, aBase + capTris[i + 2]!);
  }

  // B-face (z = 0), normal -Z, reversed winding so it faces outward.
  const bBase = positions.length / 3;
  for (const p of capRing) {
    positions.push(p.x, p.y, 0);
    normals.push(0, 0, -1);
    uvs.push(p.x, p.y);
  }
  for (let i = 0; i < capTris.length; i += 3) {
    indices.push(bBase + capTris[i + 2]!, bBase + capTris[i + 1]!, bBase + capTris[i]!);
  }

  // Edge walls. Each segment gets its own four vertices rather than sharing them along the
  // ring, so a square corner stays square instead of averaging itself round. The two ends of
  // a segment carry their own normals, which is what lets a radiused edge shade as one
  // continuous curve and still break sharply where the curve ends.
  for (const w of walls) {
    const base = positions.length / 3;
    positions.push(w.a.x, w.a.y, 0, w.b.x, w.b.y, 0, w.b.x, w.b.y, thickness, w.a.x, w.a.y, thickness);
    normals.push(w.na.x, w.na.y, 0);
    uvs.push(w.a.x, 0, w.b.x, 0, w.b.x, thickness, w.a.x, thickness);
    normals.push(w.nb.x, w.nb.y, 0);
    normals.push(w.nb.x, w.nb.y, 0);
    normals.push(w.na.x, w.na.y, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
};
