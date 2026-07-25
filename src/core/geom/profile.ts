/**
 * 2D panel profiles.
 *
 * A panel's shape is an outline polygon plus optional interior holes, living in part space
 * (X = length, Y = width — see docs/coordinate-convention.md). Extruding this to thickness
 * gives the solid; there is no BREP kernel and there is not meant to be one.
 *
 * Note what is *not* here: hinge cups, shelf-pin lines, grooves. Those are parametric
 * features attached to the panel (see model/feature.ts), deliberately not baked into this
 * geometry, so the CAM layer can read them as machining operations rather than trying to
 * recover intent from a mesh.
 */

import { type Mm, type Mm2, mm } from '../units.ts';
import { type Vec2, v2 } from './vec.ts';

/** A closed polygon. First vertex is not repeated at the end. */
export type Polygon = readonly Vec2[];

export interface Profile2D {
  /** Outer boundary, counter-clockwise. */
  readonly outline: Polygon;
  /** Interior holes, clockwise. Empty for the overwhelming majority of cabinet parts. */
  readonly holes: readonly Polygon[];
}

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

/** Signed area, positive for counter-clockwise winding. */
export const signedArea = (poly: Polygon): Mm2 => {
  let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    acc += a.x * b.y - b.x * a.y;
  }
  return acc / 2;
};

/** True material area, holes removed. This is what costing charges for. */
export const profileArea = (p: Profile2D): Mm2 =>
  Math.abs(signedArea(p.outline)) - p.holes.reduce((sum, h) => sum + Math.abs(signedArea(h)), 0);

export const polygonPerimeter = (poly: Polygon): Mm => {
  let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    acc += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return mm(acc);
};

export interface Bounds2 {
  readonly minX: Mm;
  readonly minY: Mm;
  readonly maxX: Mm;
  readonly maxY: Mm;
}

export const profileBounds = (p: Profile2D): Bounds2 => {
  const xs = p.outline.map((v) => v.x);
  const ys = p.outline.map((v) => v.y);
  return {
    minX: mm(Math.min(...xs)),
    minY: mm(Math.min(...ys)),
    maxX: mm(Math.max(...xs)),
    maxY: mm(Math.max(...ys)),
  };
};

/** Bounding-box size. This is the size a saw or a nester cares about, not the true area. */
export const profileExtent = (p: Profile2D): { length: Mm; width: Mm } => {
  const b = profileBounds(p);
  return { length: mm(b.maxX - b.minX), width: mm(b.maxY - b.minY) };
};

export const isRectangular = (p: Profile2D): boolean => {
  if (p.holes.length > 0 || p.outline.length !== 4) return false;
  const b = profileBounds(p);
  return p.outline.every(
    (v) => (v.x === b.minX || v.x === b.maxX) && (v.y === b.minY || v.y === b.maxY),
  );
};
