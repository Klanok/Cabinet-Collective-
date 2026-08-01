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
import { type Cabinet, hasAppliedEnd } from '../model/cabinet.ts';
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
  effectiveDepth: Mm = cabinet.depth,
): WallSnap | null => {
  const { c, s } = yawCosSin(cabinet.placement.yawDeg);
  // Where the middle of the cabinet lands if it moves to (x, z) without turning.
  const centre = {
    x: x + (cabinet.width / 2) * c + (effectiveDepth / 2) * s,
    z: z - (cabinet.width / 2) * s + (effectiveDepth / 2) * c,
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
    const gap = centreOffset - effectiveDepth / 2;
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

// ---------------------------------------------------------------------------------------
// Butting one cabinet against the next
// ---------------------------------------------------------------------------------------

/**
 * A cabinet's own axes in the world: along its run, and out through its front.
 *
 * These are the images of cabinet +X and +Z under `cabinetToWorld`, and they are an orthonormal
 * pair — so a world point resolves into (along, across) by two dot products and back again by
 * scaling them. That is the whole of the arithmetic below.
 */
const runAxes = (yawDeg: number) => {
  const { c, s } = yawCosSin(yawDeg);
  return { along: { x: c, z: -s }, across: { x: s, z: c } };
};

export interface NeighbourSnap {
  readonly neighbour: Cabinet;
  /** Which end of the neighbour the cabinet has been butted against. */
  readonly end: 'left' | 'right';
  readonly placement: CabinetPlacement;
  /** How far the cabinet moved to close up — along the run and across it, as one distance. */
  readonly gap: Mm;
}

/**
 * The cabinet a dragged one should butt up against, if any.
 *
 * Asked for from the bench, and it is how a run actually gets laid out: you put the sink base
 * where it goes and then push everything else up against it. It is also what removes the last
 * reason to type an X.
 *
 * **Measured along the cabinet's own run axis, not along world X.** Down the return leg of an L
 * two touching cabinets share an X entirely, so a world-axis test would call them neighbours when
 * they are one behind the other, and would never call them neighbours when they are side by side.
 * That is exactly the lesson `project/runs.ts` had to learn about finding a run, and it is the
 * same fix: resolve into the run's own frame first.
 *
 * Three things have to agree before two cabinets are in the same run, and each rules out a real
 * mistake rather than being a tidiness check:
 *
 * - **the same yaw**, or a base cabinet on the return leg of an L would butt into the back of one
 *   on the main run;
 * - **the same height off the floor**, or a wall unit would snap to the base cabinet under it;
 * - **the same line across the run**, or a cabinet out in the room would jump back to the wall.
 *
 * The line is compared at the **back** of the carcass, which is the anchor's own plane — so a 400
 * deep cabinet butts against a 560 one flush at the back and proud at the front, which is what
 * happens against a wall.
 */
export const snapToNeighbour = (
  cabinets: readonly Cabinet[],
  cabinet: Cabinet,
  x: Mm,
  z: Mm,
  maxGap: Mm,
  appliedEndThickness: (cabinet: Cabinet) => Mm = () => mm(0),
): NeighbourSnap | null => {
  let best: NeighbourSnap | null = null;

  for (const neighbour of cabinets) {
    if (neighbour.id === cabinet.id) continue;
    if (angularDistance(neighbour.placement.yawDeg, cabinet.placement.yawDeg) > YAW_TOLERANCE_DEG) {
      continue;
    }
    // Height is typed, never dragged, so two cabinets at different heights are two different runs.
    if (Math.abs(neighbour.placement.anchor.y - cabinet.placement.anchor.y) > 0.5) continue;

    // Both resolve in the *neighbour's* frame. It is the one standing still, so it is the one that
    // decides where the run is.
    const axes = runAxes(neighbour.placement.yawDeg);
    const resolve = (px: number, pz: number) => ({
      along: px * axes.along.x + pz * axes.along.z,
      across: px * axes.across.x + pz * axes.across.z,
    });

    const dragged = resolve(x, z);
    const fixed = resolve(neighbour.placement.anchor.x, neighbour.placement.anchor.z);
    const acrossGap = Math.abs(dragged.across - fixed.across);
    if (acrossGap > maxGap) continue;

    // Butt to either end of the neighbour: the dragged cabinet's left end onto the neighbour's
    // right, or its right end onto the neighbour's left.
    // An applied end is outside the carcass width. Snap the visible outer faces together, not the
    // two hidden carcass edges; include the dragged cabinet's contacting end as well so two applied
    // ends neither overlap nor leave a board-thickness gap.
    const neighbourLeft = hasAppliedEnd(neighbour.options, 'left')
      ? appliedEndThickness(neighbour)
      : 0;
    const neighbourRight = hasAppliedEnd(neighbour.options, 'right')
      ? appliedEndThickness(neighbour)
      : 0;
    const draggedLeft = hasAppliedEnd(cabinet.options, 'left')
      ? appliedEndThickness(cabinet)
      : 0;
    const draggedRight = hasAppliedEnd(cabinet.options, 'right')
      ? appliedEndThickness(cabinet)
      : 0;

    const candidates: { end: 'left' | 'right'; along: number }[] = [
      {
        end: 'right',
        along: fixed.along + neighbour.width + neighbourRight + draggedLeft,
      },
      {
        end: 'left',
        along: fixed.along - neighbourLeft - cabinet.width - draggedRight,
      },
    ];

    for (const candidate of candidates) {
      const alongGap = Math.abs(dragged.along - candidate.along);
      if (alongGap > maxGap) continue;
      const gap = mm(round(Math.hypot(alongGap, acrossGap)));
      if (best && gap >= best.gap) continue;

      best = {
        neighbour,
        end: candidate.end,
        placement: {
          anchor: v3(
            mm(round(candidate.along * axes.along.x + fixed.across * axes.across.x)),
            cabinet.placement.anchor.y,
            mm(round(candidate.along * axes.along.z + fixed.across * axes.across.z)),
          ),
          // Square with the neighbour, not merely near it — the point of snapping.
          yawDeg: neighbour.placement.yawDeg,
        },
        gap,
      };
    }
  }

  return best;
};

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
