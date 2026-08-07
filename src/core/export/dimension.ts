/**
 * A dimension — the same thing on every drawing, so it lives in one place.
 *
 * The points are in whatever 2D space the sheet works in: **plan** millimetres for a floor plan
 * (x across, z down the page), and **elevation** millimetres for an elevation (u along the wall,
 * v above the floor). The type does not care which, and neither does anything drawing it.
 */

import { type Mm, mm } from '../units.ts';
import type { Vec2 } from '../geom/vec.ts';

/**
 * `value` is carried explicitly rather than derived from `a` and `b` **on purpose**. They should
 * agree, and `dimensionIsHonest` asserts that they do — but the figure's source of truth is the
 * model, and giving it its own field is what makes the check possible at all.
 *
 * A dimension that computed its own figure from its own endpoints could never be caught being
 * wrong: a fault in the drawing would move the number with it, and the two would agree all the
 * way to the client.
 */
export interface Dimension {
  readonly a: Vec2;
  readonly b: Vec2;
  /** Unit vector the dimension line is held off the measured edge along. */
  readonly offset: Vec2;
  /** How far off, in model millimetres, so it clears the drawing at any scale. */
  readonly distance: Mm;
  /** The figure, read from the model. */
  readonly value: Mm;
  /** What is being measured — for styling, and so a test can ask for one kind. */
  readonly kind: 'overall' | 'wall' | 'cabinet' | 'height';
}

/** Does a dimension's stated figure match the points it is drawn between? */
export const dimensionIsHonest = (d: Dimension, tolerance: Mm = mm(0.5)): boolean =>
  Math.abs(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) - d.value) <= tolerance;
