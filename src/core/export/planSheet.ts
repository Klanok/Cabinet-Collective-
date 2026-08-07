/**
 * What goes on the floor plan sheet — as **data**, in model millimetres.
 *
 * ## Why this returns data rather than SVG
 *
 * A dimension is a claim about the kitchen, not a decoration on a picture. So every figure here
 * is read from the model — a wall's stored length, a cabinet's stored width — and never measured
 * off the geometry that was drawn. That is the §7 lesson stated as a rule: the moment a dimension
 * is derived from the drawing, a fault in the drawing stops being visible, because the number
 * moves with it and agrees.
 *
 * Keeping this pure also means the sheet can be asserted in millimetres rather than in markup.
 * `app/export/PlanSheet.tsx` turns it into SVG and knows nothing about what anything means.
 */

import { type Mm, mm } from '../units.ts';
import { type Vec2, v2 } from '../geom/vec.ts';
import type { Cabinet } from '../model/cabinet.ts';
import type { Project } from '../model/project.ts';
import {
  type Room,
  type Wall,
  roomBounds,
  wallDirection,
  wallInwardNormal,
  wallLength,
} from '../model/room.ts';
import { cabinetFootprint, wallAnchorOf } from '../project/wallPlacement.ts';

/**
 * A dimension: two points, and the figure that goes between them.
 *
 * `value` is carried explicitly rather than derived from `a` and `b` **on purpose**. They should
 * agree, and `dimensionIsHonest` asserts that they do — but the value's source of truth is the
 * model, and giving it its own field is what makes the check possible at all. A dimension that
 * computed its own figure from its own endpoints could never be caught being wrong.
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
  /** What the run of dimensions is measuring — for styling and for tests. */
  readonly kind: 'overall' | 'wall' | 'cabinet';
}

/** Does a dimension's stated figure match the points it is drawn between? */
export const dimensionIsHonest = (d: Dimension, tolerance: Mm = mm(0.5)): boolean =>
  Math.abs(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) - d.value) <= tolerance;

/**
 * A marker on the plan pointing at the wall an elevation is taken of — the "A" in a circle with
 * a tail, keyed to the sheet titled ELEVATION A.
 *
 * Only walls that actually carry cabinets get one. A blank wall has no elevation to key to, and
 * a marker pointing at a sheet that does not exist is the same broken promise as a stale claim in
 * the handover.
 */
export interface ElevationMarker {
  /** A, B, C… in wall order. */
  readonly key: string;
  readonly wallId: string;
  readonly wallName: string;
  /** Where the marker sits, out in the room in front of the wall. */
  readonly at: Vec2;
  /** Unit vector from the marker toward the wall it looks at. */
  readonly look: Vec2;
  /** How many cabinets it will show — the reason this wall earned a marker. */
  readonly cabinetCount: number;
}

export interface PlanSheetContent {
  readonly room: Room;
  readonly cabinets: readonly Cabinet[];
  readonly dimensions: readonly Dimension[];
  readonly markers: readonly ElevationMarker[];
  /**
   * Everything that has to fit on the paper — the room, the cabinets, **and the dimensions
   * standing off them**. Taking the extents off the room alone is how a drawing comes out with
   * its overall dimension cropped at the edge of the frame.
   */
  readonly extents: { minX: Mm; minZ: Mm; maxX: Mm; maxZ: Mm };
  readonly width: Mm;
  readonly height: Mm;
}

/** How far dimension lines stand off what they measure, in model millimetres. */
const CABINET_DIM_OFFSET: Mm = mm(320);
const WALL_DIM_OFFSET: Mm = mm(700);
const OVERALL_DIM_OFFSET: Mm = mm(1150);
/** How far off the wall an elevation marker floats. */
const MARKER_OFFSET: Mm = mm(520);

const unit = (x: number, y: number): Vec2 => {
  const len = Math.hypot(x, y);
  return len === 0 ? v2(0, -1) : v2(x / len, y / len);
};

/** Cabinets standing on a wall, in order along it from the wall's start corner. */
const cabinetsOnWall = (
  room: Room,
  cabinets: readonly Cabinet[],
  wall: Wall,
): { cabinet: Cabinet; along: Mm }[] =>
  cabinets
    .flatMap((cabinet) => {
      const anchor = wallAnchorOf(room, cabinet);
      return anchor && anchor.wallId === wall.id ? [{ cabinet, along: anchor.along }] : [];
    })
    .sort((a, b) => a.along - b.along);

/**
 * A dimension per cabinet along a wall, in a chain.
 *
 * Cabinet widths rather than the gaps between them: a client reads a run as "600, 900, 600", and
 * a fitter setting out reads the same figures. Wall cabinets are left out — they sit over the
 * base run and their dimensions would land on top of it, which is the same reason `PlanView`
 * draws them dashed.
 */
const cabinetDimensions = (room: Room, cabinets: readonly Cabinet[], wall: Wall): Dimension[] => {
  const d = wallDirection(wall);
  // Outward: dimensions go on the room side, between the cabinets and the reader.
  const n = wallInwardNormal(wall);
  const on = cabinetsOnWall(room, cabinets, wall).filter(
    ({ cabinet }) => cabinet.typeId !== 'wall',
  );

  return on.map(({ cabinet, along }) => ({
    a: v2(wall.start.x + d.x * along, wall.start.y + d.y * along),
    b: v2(wall.start.x + d.x * (along + cabinet.width), wall.start.y + d.y * (along + cabinet.width)),
    offset: unit(n.x, n.y),
    distance: CABINET_DIM_OFFSET,
    // The cabinet's own stored width — not the distance between the two points above.
    value: cabinet.width,
    kind: 'cabinet' as const,
  }));
};

/** One dimension per wall, its full length, standing outside the cabinet chain. */
const wallDimension = (wall: Wall): Dimension => {
  const n = wallInwardNormal(wall);
  return {
    a: v2(wall.start.x, wall.start.y),
    b: v2(wall.end.x, wall.end.y),
    offset: unit(n.x, n.y),
    distance: WALL_DIM_OFFSET,
    value: wallLength(wall),
    kind: 'wall',
  };
};

/**
 * The two overall dimensions — the room's extents across and down the page.
 *
 * Placed outside everything else and always on the same two edges, so a sheet is read the same
 * way every time regardless of what shape the room is.
 */
const overallDimensions = (room: Room): Dimension[] => {
  const b = roomBounds(room);
  if (room.walls.length === 0) return [];
  const width = mm(b.max.x - b.min.x);
  const depth = mm(b.max.y - b.min.y);
  if (width <= 0 || depth <= 0) return [];
  return [
    {
      a: v2(b.min.x, b.min.y),
      b: v2(b.max.x, b.min.y),
      offset: v2(0, -1),
      distance: OVERALL_DIM_OFFSET,
      value: width,
      kind: 'overall',
    },
    {
      a: v2(b.min.x, b.min.y),
      b: v2(b.min.x, b.max.y),
      offset: v2(-1, 0),
      distance: OVERALL_DIM_OFFSET,
      value: depth,
      kind: 'overall',
    },
  ];
};

/** A, B, C… — 26 walls is far past any kitchen, and past that it keeps counting rather than wrapping. */
const markerKey = (i: number): string =>
  i < 26 ? String.fromCharCode(65 + i) : `A${i - 25}`;

/**
 * One marker per wall that carries cabinets, lettered in wall order.
 *
 * **Wall order, not cabinet order.** Walking the walls as stored goes clockwise on screen (see
 * `PlanView`), so the letters run round the room the way somebody standing in it would number
 * them — rather than in whatever order the cabinets happen to sit in the job.
 *
 * A wall cabinet counts. A wall with nothing but overheads on it is still a wall worth an
 * elevation, and leaving it out would drop the only drawing that shows them.
 */
export const elevationMarkers = (
  room: Room,
  cabinets: readonly Cabinet[],
): ElevationMarker[] => {
  const markers: ElevationMarker[] = [];
  for (const wall of room.walls) {
    const on = cabinetsOnWall(room, cabinets, wall);
    if (on.length === 0) continue;
    const n = wallInwardNormal(wall);
    const mid = v2((wall.start.x + wall.end.x) / 2, (wall.start.y + wall.end.y) / 2);
    markers.push({
      key: markerKey(markers.length),
      wallId: wall.id,
      wallName: wall.name,
      at: v2(mid.x + n.x * MARKER_OFFSET, mid.y + n.y * MARKER_OFFSET),
      // The marker stands in the room and looks back at its wall.
      look: unit(-n.x, -n.y),
      cabinetCount: on.length,
    });
  }
  return markers;
};

/**
 * Everything the floor plan sheet draws, in model millimetres.
 *
 * The extents include the dimensions and the markers, because those are on the paper too — a
 * frame sized to the room alone crops the overall dimension off the edge, which is the failure
 * that looks like a styling problem and is actually an arithmetic one.
 */
export const planSheetContent = (project: Project): PlanSheetContent => {
  const { room, cabinets } = project;
  const dimensions: Dimension[] = [
    ...overallDimensions(room),
    ...room.walls.map(wallDimension),
    ...room.walls.flatMap((wall) => cabinetDimensions(room, cabinets, wall)),
  ];
  const markers = elevationMarkers(room, cabinets);

  const xs: number[] = [];
  const zs: number[] = [];
  const note = (x: number, z: number) => {
    xs.push(x);
    zs.push(z);
  };

  for (const wall of room.walls) {
    const n = wallInwardNormal(wall);
    // The wall's body lies outside the stored line, so both faces count.
    note(wall.start.x, wall.start.y);
    note(wall.end.x, wall.end.y);
    note(wall.start.x - n.x * wall.thickness, wall.start.y - n.y * wall.thickness);
    note(wall.end.x - n.x * wall.thickness, wall.end.y - n.y * wall.thickness);
  }
  for (const cabinet of cabinets) {
    for (const p of cabinetFootprint(cabinet)) note(p.x, p.z);
  }
  for (const d of dimensions) {
    // The dimension line itself, and the witness lines running out to it.
    note(d.a.x + d.offset.x * d.distance, d.a.y + d.offset.y * d.distance);
    note(d.b.x + d.offset.x * d.distance, d.b.y + d.offset.y * d.distance);
  }
  for (const m of markers) note(m.at.x, m.at.y);

  if (xs.length === 0) {
    return {
      room,
      cabinets,
      dimensions,
      markers,
      extents: { minX: mm(0), minZ: mm(0), maxX: mm(1000), maxZ: mm(1000) },
      width: mm(1000),
      height: mm(1000),
    };
  }

  const extents = {
    minX: mm(Math.min(...xs)),
    minZ: mm(Math.min(...zs)),
    maxX: mm(Math.max(...xs)),
    maxZ: mm(Math.max(...zs)),
  };
  return {
    room,
    cabinets,
    dimensions,
    markers,
    extents,
    width: mm(extents.maxX - extents.minX),
    height: mm(extents.maxZ - extents.minZ),
  };
};
