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
import type { Vec2 } from './vec.ts';

export interface MeshData {
  /** xyz triples, in part space. */
  readonly positions: Float32Array;
  /** xyz triples, one per position. */
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

const cross2 = (o: Vec2, a: Vec2, b: Vec2): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

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
        return pointInTriangle(poly[idx]!, a, b, c);
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
 * Extrude a profile from z=0 (B-face) to z=thickness (A-face), in part space.
 *
 * Interior holes contribute to area and to the CAM/nesting view of the part, but are not
 * cut out of the rendered mesh — no Phase 1 cabinet spec produces one, and a hole in the
 * viewport is cosmetic where a hole in the cutlist is not.
 */
export const extrudeProfile = (profile: Profile2D, thickness: Mm): MeshData => {
  // Curves become segments here and only here. Everything dimensional — the cutlist, the
  // banding length, the sheet the part has to fit on — is measured off the exact arc
  // upstream, so this approximation never escapes into what gets cut.
  const capRing = flattenPolygonPoints(profile.outline);
  const walls = flattenPolygonSegments(profile.outline);
  const capTris = triangulatePolygon(capRing);

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // A-face (z = thickness), normal +Z.
  const aBase = positions.length / 3;
  for (const p of capRing) {
    positions.push(p.x, p.y, thickness);
    normals.push(0, 0, 1);
  }
  for (let i = 0; i < capTris.length; i += 3) {
    indices.push(aBase + capTris[i]!, aBase + capTris[i + 1]!, aBase + capTris[i + 2]!);
  }

  // B-face (z = 0), normal -Z, reversed winding so it faces outward.
  const bBase = positions.length / 3;
  for (const p of capRing) {
    positions.push(p.x, p.y, 0);
    normals.push(0, 0, -1);
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
    normals.push(w.nb.x, w.nb.y, 0);
    normals.push(w.nb.x, w.nb.y, 0);
    normals.push(w.na.x, w.na.y, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
};
