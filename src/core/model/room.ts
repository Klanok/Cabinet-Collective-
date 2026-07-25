/**
 * The room cabinets are placed into.
 *
 * Phase 1 keeps this deliberately thin — enough to give the viewport a floor and walls to
 * read against, and enough to hang a real kitchen run off. Scribes, out-of-square walls and
 * services are the kind of thing that only earns its complexity once cabinets are actually
 * being fitted to them.
 */

import { type Mm, mm } from '../units.ts';
import { type Vec2, v2 } from '../geom/vec.ts';

export interface Wall {
  readonly id: string;
  readonly name: string;
  /** Both ends on the floor plane (world X/Z), in millimetres. */
  readonly start: Vec2;
  readonly end: Vec2;
  readonly height: Mm;
  readonly thickness: Mm;
}

export interface Room {
  readonly id: string;
  readonly name: string;
  readonly ceilingHeight: Mm;
  readonly walls: readonly Wall[];
}

export const wallLength = (w: Wall): Mm =>
  mm(Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y));

/** A plain rectangular room, walls running anticlockwise from the origin corner. */
export const rectangularRoom = (
  id: string,
  name: string,
  width: Mm,
  depth: Mm,
  ceilingHeight: Mm,
  wallThickness: Mm = mm(90),
): Room => ({
  id,
  name,
  ceilingHeight,
  walls: [
    { id: `${id}-w-south`, name: 'South', start: v2(0, 0), end: v2(width, 0), height: ceilingHeight, thickness: wallThickness },
    { id: `${id}-w-east`, name: 'East', start: v2(width, 0), end: v2(width, depth), height: ceilingHeight, thickness: wallThickness },
    { id: `${id}-w-north`, name: 'North', start: v2(width, depth), end: v2(0, depth), height: ceilingHeight, thickness: wallThickness },
    { id: `${id}-w-west`, name: 'West', start: v2(0, depth), end: v2(0, 0), height: ceilingHeight, thickness: wallThickness },
  ],
});
