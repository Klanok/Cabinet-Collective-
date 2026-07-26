/**
 * Drawing the room plan.
 *
 * The worked example throughout is an L-shaped kitchen, traced the way you'd walk it with a
 * tape. Outer envelope 4200 across by 3600 back, with an 1800 × 1500 bite taken out of the
 * far corner:
 *
 *        0                     2400        4200
 *    0   +------------------------------------+
 *        |                                    |
 *        |                                    |
 * 2100   |                     +--------------+
 *        |                     |
 *        |                     |
 * 3600   +---------------------+
 *
 * Walked from the origin corner, clockwise as drawn (X to the right, Z down the page):
 *
 *   Wall 1   4200  bearing   0        (0,0)    → (4200,0)
 *   Wall 2   2100  bearing  90     (4200,0)    → (4200,2100)
 *   Wall 3   1800  bearing 180  (4200,2100)    → (2400,2100)
 *   Wall 4   1500  bearing  90  (2400,2100)    → (2400,3600)
 *   Wall 5   2400  bearing 180  (2400,3600)    → (0,3600)
 *   Wall 6   3600  bearing 270     (0,3600)    → (0,0)      closes
 *
 * Closure check, longhand:
 *   X:  +4200 − 1800 − 2400 = 0
 *   Z:  +2100 + 1500 − 3600 = 0
 *
 * Floor area: 4200 × 3600 = 15,120,000 less the 1800 × 1500 = 2,700,000 bite,
 *             so 12,420,000 mm².
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  type Room,
  isClosedPlan,
  isInsideRoom,
  isRectangularRoom,
  rectangularRoom,
  roomFloorArea,
  roomOutline,
  wallBearingDeg,
  wallLength,
} from '../src/core/model/room.ts';
import {
  appendWall,
  closePlan,
  planGapLength,
  removeWall,
  setWallBearing,
  setWallLength,
  splitWall,
  startPlan,
} from '../src/core/project/plan.ts';

/** The rectangle every job starts as: 4200 across, 3600 back, 2400 to the ceiling. */
let rect: Room;

const corners = (room: Room): [number, number][] =>
  roomOutline(room).map((p) => [p.x, p.y] as [number, number]);

const lengths = (room: Room): number[] => room.walls.map((w) => Math.round(wallLength(w)));
const bearings = (room: Room): number[] => room.walls.map((w) => Math.round(wallBearingDeg(w)));

/** The L above, traced with typed lengths — the Definition of Done for this phase. */
const traceLShape = (from: Room): Room => {
  let room = startPlan(from, { length: mm(4200), bearingDeg: 0, name: 'Sink wall' });
  room = appendWall(room, { length: mm(2100), turnDeg: 90 });
  room = appendWall(room, { length: mm(1800), turnDeg: 90 });
  room = appendWall(room, { length: mm(1500), turnDeg: -90 });
  room = appendWall(room, { length: mm(2400), turnDeg: 90 });
  return closePlan(room);
};

beforeEach(() => {
  rect = rectangularRoom('room-1', 'Kitchen', mm(4200), mm(3600), mm(2400));
});

describe('the room as it ships', () => {
  it('is a closed rectangle', () => {
    expect(isClosedPlan(rect)).toBe(true);
    expect(isRectangularRoom(rect)).toBe(true);
    expect(lengths(rect)).toEqual([4200, 3600, 4200, 3600]);
    expect(bearings(rect)).toEqual([0, 90, 180, 270]);
    expect(roomFloorArea(rect)).toBe(4200 * 3600);
  });

  it('walks so that the room is always on the left of travel', () => {
    // The inward normal is the left normal, so every wall's normal has to point at the
    // middle of the room. Getting this backwards turns every cabinet round.
    const middle = { x: 2100, z: 1800 };
    for (const wall of rect.walls) {
      const d = { x: wall.end.x - wall.start.x, z: wall.end.y - wall.start.y };
      const inward = { x: -d.z, z: d.x };
      const toMiddle = { x: middle.x - wall.start.x, z: middle.z - wall.start.y };
      expect(inward.x * toMiddle.x + inward.z * toMiddle.z).toBeGreaterThan(0);
    }
  });
});

describe('tracing an L-shaped kitchen with typed lengths', () => {
  it('closes on the corner it started from', () => {
    const room = traceLShape(rect);

    expect(room.walls).toHaveLength(6);
    expect(isClosedPlan(room)).toBe(true);
    expect(planGapLength(room)).toBe(0);
    expect(isRectangularRoom(room)).toBe(false);
  });

  it('puts every corner exactly where the tape says', () => {
    expect(corners(traceLShape(rect))).toEqual([
      [0, 0],
      [4200, 0],
      [4200, 2100],
      [2400, 2100],
      [2400, 3600],
      [0, 3600],
    ]);
  });

  it('works out the closing wall for you — 3600 back to the origin', () => {
    const room = traceLShape(rect);
    const last = room.walls[5]!;

    expect(Math.round(wallLength(last))).toBe(3600);
    expect(Math.round(wallBearingDeg(last))).toBe(270);
    expect([last.end.x, last.end.y]).toEqual([0, 0]);
  });

  it('encloses 12,420,000 mm² — the rectangle less the bite', () => {
    expect(roomFloorArea(traceLShape(rect))).toBe(4200 * 3600 - 1800 * 1500);
  });

  it('keeps the ceiling height and wall thickness it started with', () => {
    const room = traceLShape(rect);
    expect(room.walls.every((w) => w.height === 2400)).toBe(true);
    expect(room.walls.every((w) => w.thickness === 90)).toBe(true);
  });

  it('names the first wall what you called it and numbers the rest', () => {
    const room = traceLShape(rect);
    expect(room.walls.map((w) => w.name)).toEqual([
      'Sink wall',
      'Wall 2',
      'Wall 3',
      'Wall 4',
      'Wall 5',
      'Wall 6',
    ]);
  });

  it('reports the gap while the plan is still open', () => {
    let room = startPlan(rect, { length: mm(4200), bearingDeg: 0 });
    room = appendWall(room, { length: mm(2100), turnDeg: 90 });
    // Two walls in: the walk is at (4200, 2100), so it is √(4200² + 2100²) from home.
    expect(isClosedPlan(room)).toBe(false);
    expect(Math.round(planGapLength(room))).toBe(Math.round(Math.hypot(4200, 2100)));
  });
});

describe('typing a new length', () => {
  it('keeps a rectangle closed by letting the opposite wall take up the difference', () => {
    // 4200 → 4800 across. The wall opposite runs the same way, so it gives up the 600.
    const wider = setWallLength(rect, rect.walls[0]!.id, mm(4800));

    expect(isClosedPlan(wider)).toBe(true);
    expect(lengths(wider)).toEqual([4800, 3600, 4800, 3600]);
    expect(roomFloorArea(wider)).toBe(4800 * 3600);
  });

  it('moves every wall that follows the one you changed', () => {
    const wider = setWallLength(rect, rect.walls[0]!.id, mm(4800));
    // The east wall started at x = 4200 and has to have gone with it.
    expect(wider.walls[1]!.start.x).toBe(4800);
    expect(wider.walls[1]!.end.x).toBe(4800);
    // The origin corner never moves — the walk starts there.
    expect(corners(wider)[0]).toEqual([0, 0]);
  });

  it('keeps the L closed, the first later parallel wall absorbing it', () => {
    // Sink wall 4200 → 4800. Wall 3 runs back the other way, so the 600 lands there:
    // 1800 + 600 = 2400, and the X legs balance again: 4800 − 2400 − 2400 = 0.
    const shaped = traceLShape(rect);
    const room = setWallLength(shaped, shaped.walls[0]!.id, mm(4800));

    expect(isClosedPlan(room)).toBe(true);
    expect(lengths(room)).toEqual([4800, 2100, 2400, 1500, 2400, 3600]);
    expect(roomFloorArea(room)).toBe(4800 * 3600 - 2400 * 1500);
  });

  it('leaves an open plan open rather than moving a wall you never touched', () => {
    let room = startPlan(rect, { length: mm(4200), bearingDeg: 0 });
    room = appendWall(room, { length: mm(2100), turnDeg: 90 });
    const longer = setWallLength(room, room.walls[0]!.id, mm(4800));

    expect(lengths(longer)).toEqual([4800, 2100]);
    expect(isClosedPlan(longer)).toBe(false);
  });

  it('refuses to shrink a wall away to nothing', () => {
    const room = setWallLength(rect, rect.walls[0]!.id, mm(5));
    expect(lengths(room)[0]).toBe(50);
  });
});

describe('turning a wall', () => {
  it('swings everything after it round', () => {
    // Turn the east wall from 90° to 45°. It still runs 3600, so its far end lands at
    // 4200 + 3600·cos45 = 6745.6, 0 + 3600·sin45 = 2545.6.
    const room = setWallBearing(rect, rect.walls[1]!.id, 45);
    const east = room.walls[1]!;

    expect(Math.round(east.end.x)).toBe(Math.round(4200 + 3600 * Math.cos(Math.PI / 4)));
    expect(Math.round(east.end.y)).toBe(Math.round(3600 * Math.sin(Math.PI / 4)));
    // The wall after it starts from the new corner, not the old one.
    expect(room.walls[2]!.start).toEqual(east.end);
  });
});

describe('splitting and removing walls', () => {
  it('splits a wall into two halves that run exactly where the one wall did', () => {
    const room = splitWall(rect, rect.walls[0]!.id, mm(2400));

    expect(room.walls).toHaveLength(5);
    expect(lengths(room)).toEqual([2400, 1800, 3600, 4200, 3600]);
    // Same shape, same area — a split introduces a corner, it doesn't move anything.
    expect(isClosedPlan(room)).toBe(true);
    expect(roomFloorArea(room)).toBe(4200 * 3600);
  });

  it('makes the L out of the rectangle by splitting and turning', () => {
    // The other way to draw the same kitchen: split the east wall at 2100, turn the second
    // half to head back across, then let the rest follow.
    let room = splitWall(rect, rect.walls[1]!.id, mm(2100));
    room = setWallBearing(room, room.walls[2]!.id, 180);
    room = setWallLength(room, room.walls[2]!.id, mm(1800));

    expect(corners(room).slice(0, 4)).toEqual([
      [0, 0],
      [4200, 0],
      [4200, 2100],
      [2400, 2100],
    ]);
  });

  it('removes a wall and leaves the rest of the room where it was', () => {
    const room = removeWall(rect, rect.walls[1]!.id);

    expect(room.walls).toHaveLength(3);
    expect(lengths(room)).toEqual([4200, 4200, 3600]);
    // Nothing can absorb the missing 3600, so the plan is honestly open.
    expect(isClosedPlan(room)).toBe(false);
  });

  it('does not slide the room back to the origin when the first wall goes', () => {
    const room = removeWall(rect, rect.walls[0]!.id);
    // The walk now starts where the first wall used to end.
    expect([room.walls[0]!.start.x, room.walls[0]!.start.y]).toEqual([4200, 0]);
  });

  it('will not remove the last wall standing', () => {
    const one = startPlan(rect, { length: mm(4200), bearingDeg: 0 });
    expect(removeWall(one, one.walls[0]!.id).walls).toHaveLength(1);
  });
});

describe('inside the room', () => {
  it('knows the bite out of the L is not part of the room', () => {
    const room = traceLShape(rect);

    // Well inside the long leg.
    expect(isInsideRoom(room, mm(1200), mm(3000))).toBe(true);
    // Same distance back, but out in the bite — floor space that doesn't exist.
    expect(isInsideRoom(room, mm(3600), mm(3000))).toBe(false);
    // In the top half, where the room is full width.
    expect(isInsideRoom(room, mm(3600), mm(1200))).toBe(true);
    // Outside altogether.
    expect(isInsideRoom(room, mm(5000), mm(1200))).toBe(false);
  });
});
