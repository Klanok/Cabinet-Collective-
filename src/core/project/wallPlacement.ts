/**
 * Standing a cabinet against a wall.
 *
 * A cabinet's position is, and stays, its `CabinetPlacement` — an anchor and a yaw. This
 * module doesn't add a second way of storing where a cabinet is; it converts between that one
 * truth and the way a cabinetmaker actually says it: *"600 along the sink wall, back to the
 * wall."*
 *
 * Both directions are here and each is the other's inverse. `placeAgainstWall` takes the
 * spoken version and produces the placement; `wallAnchorOf` reads a placement and works out
 * which wall it is against and how far along. Nothing is cached between them, so a wall being
 * renamed, moved or deleted can never leave a cabinet holding a stale reference to it.
 *
 * ## The geometry, once
 *
 * A wall's inward normal is the direction a cabinet standing against it faces, so the yaw is
 * fixed by the wall. Cabinet +X — the cabinet's own right — then falls exactly along the
 * wall's direction of travel, which is why "distance along the wall" and "distance to the
 * cabinet's left-hand end" are the same number, on every wall, at any angle.
 */

import { type Mm, mm } from '../units.ts';
import type { Cabinet } from '../model/cabinet.ts';
import { type Room, type Wall, findWall, normaliseDeg, wallDirection, wallInwardNormal, wallLength } from '../model/room.ts';
import { type CabinetPlacement, yawCosSin } from '../geom/placement.ts';
import { v3 } from '../geom/vec.ts';

/** Where a cabinet sits on a wall, in the terms you'd write on a plan. */
export interface WallAnchor {
  readonly wallId: string;
  /** Along the wall from its start corner to the cabinet's left-hand end. */
  readonly along: Mm;
  /** Gap left between the wall face and the back of the carcass — scribe, services, or none. */
  readonly offset: Mm;
}

/** How far off a wall a cabinet can be and still count as against it. */
export const AGAINST_WALL_TOLERANCE: Mm = mm(120);

/** How far out the yaw can be and still count as facing the same way as the wall. */
const YAW_TOLERANCE_DEG = 1.5;

/** Yaw that puts a cabinet's back on this wall and its front into the room. */
export const yawAgainstWall = (wall: Wall): number => {
  const n = wallInwardNormal(wall);
  // A cabinet at yaw θ faces (sin θ, cos θ) in world X/Z — see geom/placement.ts.
  return normaliseDeg((Math.atan2(n.x, n.y) * 180) / Math.PI);
};

/** The placement that stands a cabinet against a wall, at a given height off the floor. */
export const placeAgainstWall = (room: Room, anchor: WallAnchor, y: Mm): CabinetPlacement | null => {
  const wall = findWall(room, anchor.wallId);
  if (!wall) return null;
  const d = wallDirection(wall);
  const n = wallInwardNormal(wall);
  const offset = anchor.offset;

  return {
    anchor: v3(
      wall.start.x + d.x * anchor.along + n.x * offset,
      y,
      wall.start.y + d.y * anchor.along + n.y * offset,
    ),
    yawDeg: yawAgainstWall(wall),
  };
};

const angularDistance = (a: number, b: number): number => {
  const diff = Math.abs(normaliseDeg(a) - normaliseDeg(b));
  return Math.min(diff, 360 - diff);
};

/**
 * Which wall is this cabinet against, and where along it?
 *
 * Null when it isn't against one — an island, or something still being dragged into place.
 * That is a normal answer, not a failure.
 */
export const wallAnchorOf = (
  room: Room,
  cabinet: Cabinet,
  maxOffset: Mm = AGAINST_WALL_TOLERANCE,
): WallAnchor | null => {
  const { anchor, yawDeg } = cabinet.placement;
  let best: WallAnchor | null = null;

  for (const wall of room.walls) {
    const length = wallLength(wall);
    if (length === 0) continue;
    if (angularDistance(yawDeg, yawAgainstWall(wall)) > YAW_TOLERANCE_DEG) continue;

    const d = wallDirection(wall);
    const n = wallInwardNormal(wall);
    const dx = anchor.x - wall.start.x;
    const dz = anchor.z - wall.start.y;
    const offset = dx * n.x + dz * n.y;
    // Behind the wall face, or too far into the room to be against it.
    if (offset < -0.5 || offset > maxOffset) continue;

    const along = dx * d.x + dz * d.y;
    // The cabinet has to actually stand on this wall, not on its extension past the corner.
    if (along < -cabinet.width || along > length) continue;

    if (!best || Math.abs(offset) < Math.abs(best.offset)) {
      best = { wallId: wall.id, along: mm(round(along)), offset: mm(round(offset)) };
    }
  }

  return best;
};

const round = (n: number): number => Math.round(n * 1e6) / 1e6;

export interface WallSnap {
  readonly wall: Wall;
  readonly anchor: WallAnchor;
  readonly placement: CabinetPlacement;
  /** Gap that was left between the wall face and the back of the carcass before snapping. */
  readonly gap: Mm;
}

/**
 * The wall a cabinet dropped at this point should snap back against.
 *
 * Used by dragging, so pushing a cabinet towards a wall parks it flush and square rather than
 * a few millimetres proud and a fraction of a degree out.
 *
 * The test is made on the **middle of the cabinet**, not on its anchor corner. The anchor is
 * one corner of a box that may be turned any way, so how near it is to a wall says very little
 * about how near the cabinet is; its centre says exactly that, on every wall, at every angle.
 * A cabinet whose centre has gone past a wall has been dragged out of the room rather than up
 * against it, so those are left alone.
 */
export const snapToWall = (
  room: Room,
  cabinet: Cabinet,
  x: Mm,
  z: Mm,
  maxGap: Mm,
): WallSnap | null => {
  const { c, s } = yawCosSin(cabinet.placement.yawDeg);
  // Where the middle of the cabinet lands if it moves to (x, z) without turning.
  const centre = {
    x: x + (cabinet.width / 2) * c + (cabinet.depth / 2) * s,
    z: z - (cabinet.width / 2) * s + (cabinet.depth / 2) * c,
  };

  let best: WallSnap | null = null;

  for (const wall of room.walls) {
    const length = wallLength(wall);
    if (length < cabinet.width) continue;

    const d = wallDirection(wall);
    const n = wallInwardNormal(wall);
    const dx = centre.x - wall.start.x;
    const dz = centre.z - wall.start.y;

    const centreOffset = dx * n.x + dz * n.y;
    // Past the wall entirely — dragged out of the room, not up against it.
    if (centreOffset < 0) continue;
    // Standing flush, the centre sits half a carcass depth in front of the face. A negative
    // gap means the cabinet is currently buried in the wall, which still wants snapping out.
    const gap = centreOffset - cabinet.depth / 2;
    if (gap > maxGap) continue;

    const alongCentre = dx * d.x + dz * d.y;
    const along = mm(
      Math.round(clamp(alongCentre - cabinet.width / 2, 0, length - cabinet.width)),
    );
    const anchor: WallAnchor = { wallId: wall.id, along, offset: mm(0) };
    const placement = placeAgainstWall(room, anchor, cabinet.placement.anchor.y);
    if (!placement) continue;

    if (!best || gap < best.gap) best = { wall, anchor, placement, gap: mm(round(gap)) };
  }

  return best;
};

const clamp = (n: number, low: number, high: number): number =>
  Math.min(Math.max(n, low), Math.max(low, high));

/**
 * The footprint of a cabinet's carcass on the floor, as four world X/Z corners in order.
 * Front-left, front-right, back-right, back-left — so it draws as a closed shape on a plan.
 */
export const cabinetFootprint = (cabinet: Cabinet): { x: Mm; z: Mm }[] => {
  const { c, s } = yawCosSin(cabinet.placement.yawDeg);
  // Cabinet +X maps to world (c, -s) and cabinet +Z to world (s, c) — see cabinetToWorld.
  const { x: ax, z: az } = cabinet.placement.anchor;
  const corner = (u: number, v: number) => ({
    x: mm(round(ax + u * c + v * s)),
    z: mm(round(az - u * s + v * c)),
  });
  return [
    corner(0, cabinet.depth),
    corner(cabinet.width, cabinet.depth),
    corner(cabinet.width, 0),
    corner(0, 0),
  ];
};

/** Centre of a cabinet's footprint — the robust point to test against the room outline. */
export const cabinetFootprintCentre = (cabinet: Cabinet): { x: Mm; z: Mm } => {
  const corners = cabinetFootprint(cabinet);
  return {
    x: mm(round(corners.reduce((t, p) => t + p.x, 0) / corners.length)),
    z: mm(round(corners.reduce((t, p) => t + p.z, 0) / corners.length)),
  };
};
