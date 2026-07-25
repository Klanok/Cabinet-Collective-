/**
 * Vector primitives and the signed-axis machinery that encodes the coordinate convention
 * (see docs/coordinate-convention.md).
 *
 * Cabinet parts are axis-aligned, so panel orientation is expressed as a pair of signed axes
 * rather than a rotation matrix. That keeps orientation exhaustively enumerable — and so
 * testable — instead of being a quaternion nobody can eyeball.
 */

import type { Mm } from '../units.ts';

export interface Vec2 {
  readonly x: Mm;
  readonly y: Mm;
}

export interface Vec3 {
  readonly x: Mm;
  readonly y: Mm;
  readonly z: Mm;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const ZERO3: Vec3 = v3(0, 0, 0);

export const add3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale3 = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);

export const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * The six signed axis directions. Every panel placement is built from these, which is what
 * makes "is this panel facing the right way" a decidable question.
 */
export type SignedAxis = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

export const SIGNED_AXES: readonly SignedAxis[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

const AXIS_VECTORS: Record<SignedAxis, Vec3> = {
  '+X': v3(1, 0, 0),
  '-X': v3(-1, 0, 0),
  '+Y': v3(0, 1, 0),
  '-Y': v3(0, -1, 0),
  '+Z': v3(0, 0, 1),
  '-Z': v3(0, 0, -1),
};

export const axisVector = (a: SignedAxis): Vec3 => AXIS_VECTORS[a];

export const negateAxis = (a: SignedAxis): SignedAxis =>
  (a.startsWith('+') ? `-${a[1]}` : `+${a[1]}`) as SignedAxis;

/** True when the two axes lie on different lines — i.e. they can span a plane. */
export const axesArePerpendicular = (a: SignedAxis, b: SignedAxis): boolean => a[1] !== b[1];

/**
 * The signed axis equal to `a × b`. Defined only for perpendicular axes; throws otherwise,
 * because a parallel pair means a placement was built wrong and silently returning a zero
 * vector would push the error downstream into geometry that looks merely "flat".
 */
export const crossAxis = (a: SignedAxis, b: SignedAxis): SignedAxis => {
  if (!axesArePerpendicular(a, b)) {
    throw new Error(`crossAxis: ${a} and ${b} are parallel — placement axes must be perpendicular`);
  }
  const c = cross3(axisVector(a), axisVector(b));
  const found = SIGNED_AXES.find((s) => {
    const sv = axisVector(s);
    return sv.x === c.x && sv.y === c.y && sv.z === c.z;
  });
  /* istanbul ignore next — unreachable for perpendicular unit axes */
  if (!found) throw new Error(`crossAxis: ${a} × ${b} is not a unit axis`);
  return found;
};
