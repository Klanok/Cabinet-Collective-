/**
 * The transform chain: part space → cabinet space → world space.
 *
 * Both steps are invertible. That matters for Phase 4: a feature the user positions by
 * pointing at the 3D view arrives in world space, and CAM needs it back in part space where
 * the machine works.
 */

import { type Mm, mm } from '../units.ts';
import {
  type SignedAxis,
  type Vec3,
  add3,
  axisVector,
  crossAxis,
  dot3,
  scale3,
  sub3,
  v3,
} from './vec.ts';

/**
 * Where a panel sits inside its cabinet. Axis-aligned by construction — see the coordinate
 * convention doc for why this is a pair of axes rather than a matrix.
 */
export interface PanelPlacement {
  /** Cabinet-space image of the part-space origin (the B-face bottom-left corner). */
  readonly origin: Vec3;
  /** Cabinet-space direction of part +X (length). */
  readonly u: SignedAxis;
  /** Cabinet-space direction of part +Y (width). */
  readonly v: SignedAxis;
}

export const placement = (origin: Vec3, u: SignedAxis, v: SignedAxis): PanelPlacement => {
  // Validate eagerly: a bad placement produces geometry that renders fine but machines wrong.
  crossAxis(u, v);
  return { origin, u, v };
};

/**
 * Cabinet-space thickness direction — the image of part +Z, pointing B-face → A-face.
 * Derived, never stored, so it can't disagree with `u` and `v`.
 */
export const placementNormal = (p: PanelPlacement): SignedAxis => crossAxis(p.u, p.v);

/** part space → cabinet space. */
export const partToCabinet = (p: PanelPlacement, point: Vec3): Vec3 => {
  const w = placementNormal(p);
  return add3(
    p.origin,
    add3(
      scale3(axisVector(p.u), point.x),
      add3(scale3(axisVector(p.v), point.y), scale3(axisVector(w), point.z)),
    ),
  );
};

/** cabinet space → part space. Inverse of `partToCabinet`. */
export const cabinetToPart = (p: PanelPlacement, point: Vec3): Vec3 => {
  const d = sub3(point, p.origin);
  const w = placementNormal(p);
  return v3(dot3(d, axisVector(p.u)), dot3(d, axisVector(p.v)), dot3(d, axisVector(w)));
};

/**
 * Where a cabinet sits in the room. Cabinets are upright and rotate only about the vertical
 * axis, so a yaw angle is the whole story — no need for a general rotation.
 */
export interface CabinetPlacement {
  /** World-space image of the cabinet-space origin: bottom-back-left of the carcass. */
  readonly anchor: Vec3;
  /** Rotation about world +Y, in degrees. 0 means the cabinet front faces world +Z. */
  readonly yawDeg: number;
}

const yawCosSin = (yawDeg: number): { c: number; s: number } => {
  // Snap the four cardinal orientations exactly. Most runs are axis-aligned, and letting
  // cos(90°) come back as 6.1e-17 puts that error into every part coordinate downstream.
  const normalised = ((yawDeg % 360) + 360) % 360;
  if (normalised === 0) return { c: 1, s: 0 };
  if (normalised === 90) return { c: 0, s: 1 };
  if (normalised === 180) return { c: -1, s: 0 };
  if (normalised === 270) return { c: 0, s: -1 };
  const r = (normalised * Math.PI) / 180;
  return { c: Math.cos(r), s: Math.sin(r) };
};

/** cabinet space → world space. */
export const cabinetToWorld = (p: CabinetPlacement, point: Vec3): Vec3 => {
  const { c, s } = yawCosSin(p.yawDeg);
  // Right-handed rotation about +Y.
  const x = point.x * c + point.z * s;
  const z = -point.x * s + point.z * c;
  return add3(p.anchor, v3(x, point.y, z));
};

/** world space → cabinet space. Inverse of `cabinetToWorld`. */
export const worldToCabinet = (p: CabinetPlacement, point: Vec3): Vec3 => {
  const { c, s } = yawCosSin(p.yawDeg);
  const d = sub3(point, p.anchor);
  return v3(d.x * c - d.z * s, d.y, d.x * s + d.z * c);
};

/** part space → world space, composing both steps. */
export const partToWorld = (cab: CabinetPlacement, pan: PanelPlacement, point: Vec3): Vec3 =>
  cabinetToWorld(cab, partToCabinet(pan, point));

/** world space → part space. */
export const worldToPart = (cab: CabinetPlacement, pan: PanelPlacement, point: Vec3): Vec3 =>
  cabinetToPart(pan, worldToCabinet(cab, point));

/** Yaw for a cabinet whose back sits against a wall running along the given world axis. */
export const yawForFrontFacing = (front: SignedAxis): number => {
  switch (front) {
    case '+Z':
      return 0;
    case '+X':
      return 90;
    case '-Z':
      return 180;
    case '-X':
      return 270;
    default:
      throw new Error(`yawForFrontFacing: ${front} is not horizontal — cabinets stand upright`);
  }
};

export interface Bounds3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

export const boundsFromPoints = (points: readonly Vec3[]): Bounds3 => {
  if (points.length === 0) throw new Error('boundsFromPoints: no points');
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  return {
    min: v3(Math.min(...xs), Math.min(...ys), Math.min(...zs)),
    max: v3(Math.max(...xs), Math.max(...ys), Math.max(...zs)),
  };
};

export const boundsSize = (b: Bounds3): { w: Mm; h: Mm; d: Mm } => ({
  w: mm(b.max.x - b.min.x),
  h: mm(b.max.y - b.min.y),
  d: mm(b.max.z - b.min.z),
});
