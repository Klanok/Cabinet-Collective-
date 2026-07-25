/**
 * Three.js adapter for the model's transforms.
 *
 * The matrices are derived by pushing the basis vectors through the model's own transform
 * functions rather than being rebuilt from angles and axes. That means the viewport cannot
 * silently disagree with the geometry the cutlist and CAM layers are working from — if the
 * convention ever changes, the render changes with it.
 */

import { Matrix4, Vector3 } from 'three';
import {
  type CabinetPlacement,
  type PanelPlacement,
  cabinetToWorld,
  partToCabinet,
} from '../../core/geom/placement.ts';
import { type Vec3, sub3, v3 } from '../../core/geom/vec.ts';

const toVector3 = (v: Vec3): Vector3 => new Vector3(v.x, v.y, v.z);

/**
 * Build a matrix from a transform function by mapping the origin and the three unit axes
 * through it. Valid for the affine transforms this model uses, which is all of them.
 */
const matrixFrom = (transform: (p: Vec3) => Vec3): Matrix4 => {
  const origin = transform(v3(0, 0, 0));
  const basis = [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)].map((axis) =>
    toVector3(sub3(transform(axis), origin)),
  );
  return new Matrix4().makeBasis(basis[0]!, basis[1]!, basis[2]!).setPosition(toVector3(origin));
};

/** part space → cabinet space. */
export const panelMatrix = (placement: PanelPlacement): Matrix4 =>
  matrixFrom((p) => partToCabinet(placement, p));

/** cabinet space → world space. */
export const cabinetMatrix = (placement: CabinetPlacement): Matrix4 =>
  matrixFrom((p) => cabinetToWorld(placement, p));
