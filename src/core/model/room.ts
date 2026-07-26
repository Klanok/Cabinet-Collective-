/**
 * The room cabinets are placed into.
 *
 * A room is a **list of wall segments**, in the order you walk round the room. It has always
 * been that; `rectangularRoom` is one constructor for it, not the shape of the data. Drawing
 * an L-shaped kitchen therefore needs no schema change — it is the same list with six
 * segments in it instead of four.
 *
 * Two conventions hold everything together, and both are load-bearing:
 *
 *   1. **A wall's stored line is its inside face** — the surface a cabinet back touches, not a
 *      centreline. `thickness` is drawn outward from that line. A cabinet against the wall at
 *      the origin therefore sits at exactly z = 0, which is where the sample kitchen has
 *      always put it.
 *   2. **Walls run so that the room is on the left of the direction of travel.** That makes
 *      the inward normal the left normal, `(-dz, dx)`, with no per-wall "which side is in?"
 *      flag to get wrong. Drawn on a plan with X to the right and Z down the page, that is
 *      clockwise round the room.
 *
 * Scribes, out-of-square walls and services still aren't modelled — they earn their complexity
 * when cabinets are actually being fitted, not before.
 */

import { type Mm, mm } from '../units.ts';
import { type Vec2, v2 } from '../geom/vec.ts';

export interface Wall {
  readonly id: string;
  readonly name: string;
  /**
   * Both ends on the floor plane, in millimetres. `Vec2.y` is **world Z** — the plan is the
   * world's X/Z plane seen from above, so a 2D point's second component is a Z.
   */
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

/** How close two corners must be to count as the same corner. */
export const CORNER_TOLERANCE: Mm = mm(0.5);

export const wallLength = (w: Wall): Mm =>
  mm(Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y));

/** Unit vector along the wall, from start to end, in world X/Z. */
export const wallDirection = (w: Wall): Vec2 => {
  const length = wallLength(w);
  if (length === 0) return v2(1, 0);
  return v2((w.end.x - w.start.x) / length, (w.end.y - w.start.y) / length);
};

/**
 * Unit vector pointing from the wall's face **into the room** — the direction a cabinet
 * standing against it faces.
 *
 * The left normal of the direction of travel, per the walking convention above.
 */
export const wallInwardNormal = (w: Wall): Vec2 => {
  const d = wallDirection(w);
  return v2(-d.y, d.x);
};

/**
 * Direction of the wall as an angle in degrees, measured from world +X turning toward +Z.
 * Returned in [0, 360).
 *
 * On a plan drawn with X to the right and Z down the page, increasing bearing turns
 * clockwise, so a normal rectangular room is four walls at 0°, 90°, 180°, 270°.
 */
export const wallBearingDeg = (w: Wall): number => {
  const d = wallDirection(w);
  return normaliseDeg((Math.atan2(d.y, d.x) * 180) / Math.PI);
};

/** Fold any angle into [0, 360). */
export const normaliseDeg = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * The corners of the floor, in walking order.
 *
 * Each wall contributes its start corner. A chain that hasn't been closed yet still yields a
 * usable polygon — the closure back to the first corner is implied, which is what you would
 * see if you drew the same half-finished plan on paper.
 */
export const roomOutline = (room: Room): Vec2[] => {
  const walls = room.walls.filter((w) => wallLength(w) > 0);
  if (walls.length === 0) return [];
  const corners = walls.map((w) => w.start);
  // An open chain's far end is a real corner of the shape; a closed one's just repeats the
  // first corner and would give the polygon a zero-length edge.
  const last = walls[walls.length - 1]!.end;
  const first = corners[0]!;
  if (Math.hypot(last.x - first.x, last.y - first.y) > CORNER_TOLERANCE) corners.push(last);
  return corners;
};

/** True when the walls form a closed ring — the last wall ends where the first one starts. */
export const isClosedPlan = (room: Room): boolean => {
  const walls = room.walls.filter((w) => wallLength(w) > 0);
  if (walls.length < 3) return false;
  if (!wallsAreChained(walls)) return false;
  const first = walls[0]!.start;
  const last = walls[walls.length - 1]!.end;
  return Math.hypot(last.x - first.x, last.y - first.y) <= CORNER_TOLERANCE;
};

/** True when each wall starts where the one before it ended. */
export const wallsAreChained = (walls: readonly Wall[]): boolean =>
  walls.every((w, i) => {
    if (i === 0) return true;
    const previousEnd = walls[i - 1]!.end;
    return Math.hypot(w.start.x - previousEnd.x, w.start.y - previousEnd.y) <= CORNER_TOLERANCE;
  });

/**
 * Floor area enclosed by the outline, by the shoelace formula. Always positive — which way
 * round the ring was walked is a modelling convention, not something to surface as a negative
 * number of square millimetres.
 */
export const roomFloorArea = (room: Room): number => {
  const ring = roomOutline(room);
  if (ring.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
};

/** Bounding box of the floor, for fitting a view to the plan. */
export const roomBounds = (room: Room): { min: Vec2; max: Vec2 } => {
  const ring = roomOutline(room);
  if (ring.length === 0) return { min: v2(0, 0), max: v2(0, 0) };
  const xs = ring.map((p) => p.x);
  const zs = ring.map((p) => p.y);
  return {
    min: v2(Math.min(...xs), Math.min(...zs)),
    max: v2(Math.max(...xs), Math.max(...zs)),
  };
};

/**
 * Is this point inside the room?
 *
 * Even-odd ray casting on the floor outline. Used to say "that cabinet is outside the room"
 * once the room stopped being a rectangle you could eyeball against two numbers.
 */
export const isInsideRoom = (room: Room, x: Mm, z: Mm): boolean => {
  const ring = roomOutline(room);
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const straddles = a.y > z !== b.y > z;
    if (straddles && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/**
 * True when the room is still the plain four-walled box `rectangularRoom` builds.
 *
 * The settings screen offers width/depth boxes only while that holds; once a plan has been
 * drawn, two numbers can no longer describe it and editing there would silently throw the
 * drawing away.
 */
export const isRectangularRoom = (room: Room): boolean => {
  if (room.walls.length !== 4) return false;
  if (!isClosedPlan(room)) return false;
  const bearings = room.walls.map((w) => Math.round(wallBearingDeg(w)));
  return bearings.every((b) => b % 90 === 0) && new Set(bearings).size === 4;
};

/** A plain rectangular room, walked so the room stays on the left, starting at the origin. */
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

export const findWall = (room: Room, wallId: string): Wall | undefined =>
  room.walls.find((w) => w.id === wallId);
