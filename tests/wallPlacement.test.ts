/**
 * Standing cabinets against walls.
 *
 * The room throughout is the shipped rectangle: 4200 across (X) by 3600 back (Z), walked
 * clockwise from the origin corner.
 *
 *   South   (0,0)      → (4200,0)      inward normal  +Z    a cabinet on it faces  +Z   yaw   0
 *   East    (4200,0)   → (4200,3600)   inward normal  −X    a cabinet on it faces  −X   yaw 270
 *   North   (4200,3600)→ (0,3600)      inward normal  −Z    a cabinet on it faces  −Z   yaw 180
 *   West    (0,3600)   → (0,0)         inward normal  +X    a cabinet on it faces  +X   yaw  90
 *
 * The yaws are checked against `yawForFrontFacing`, which the coordinate convention already
 * fixed, rather than being asserted independently — two sources for the same fact is how a
 * cabinet ends up facing the wall.
 *
 * Worked example used more than once below: a 600-wide, 560-deep base cabinet 900 along the
 * **east** wall, carcass 150 off the floor on its kick.
 *
 *   anchor  = wall start (4200,0) + direction (0,1)·900 + normal (−1,0)·0
 *           = (4200, 150, 900)
 *   yaw     = 270, so cabinet +X (its own right) runs to world +Z
 *   it therefore occupies z 900 → 1500, and x 4200 back to 3640
 *   footprint centre = (3920, 1200)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { type Room, isInsideRoom, rectangularRoom } from '../src/core/model/room.ts';
import { yawForFrontFacing } from '../src/core/geom/placement.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import {
  cabinetFootprint,
  cabinetFootprintCentre,
  placeAgainstWall,
  snapToWall,
  wallAnchorOf,
  yawAgainstWall,
} from '../src/core/project/wallPlacement.ts';
import { checkLayout } from '../src/core/project/layout.ts';
import { appendWall, closePlan, startPlan } from '../src/core/project/plan.ts';

let room: Room;

const wallNamed = (r: Room, name: string) => r.walls.find((w) => w.name === name)!;

/** A base cabinet placed straight onto a wall, as the UI does it. */
const onWall = (r: Room, wallName: string, along: number, width = 600, offset = 0) => {
  const project = createEmptyProject('Placement test');
  const cabinet = createCabinet(
    { typeId: 'base', name: 'B1', width: mm(width), x: mm(0) },
    project.defaults,
    project.constructions,
  );
  const placement = placeAgainstWall(
    r,
    { wallId: wallNamed(r, wallName).id, along: mm(along), offset: mm(offset) },
    cabinet.placement.anchor.y,
  )!;
  return { ...cabinet, placement };
};

beforeEach(() => {
  resetIdCounter();
  room = rectangularRoom('room-1', 'Kitchen', mm(4200), mm(3600), mm(2400));
});

describe('which way a cabinet faces on each wall', () => {
  it('agrees with the coordinate convention on all four walls', () => {
    expect(yawAgainstWall(wallNamed(room, 'South'))).toBe(yawForFrontFacing('+Z'));
    expect(yawAgainstWall(wallNamed(room, 'East'))).toBe(yawForFrontFacing('-X'));
    expect(yawAgainstWall(wallNamed(room, 'North'))).toBe(yawForFrontFacing('-Z'));
    expect(yawAgainstWall(wallNamed(room, 'West'))).toBe(yawForFrontFacing('+X'));
  });

  it('faces every cabinet into the room, whatever the wall', () => {
    // The front direction has to point at the middle of the room from every wall.
    const middle = { x: 2100, z: 1800 };
    for (const wall of room.walls) {
      const yaw = (yawAgainstWall(wall) * Math.PI) / 180;
      const front = { x: Math.sin(yaw), z: Math.cos(yaw) };
      const toMiddle = { x: middle.x - wall.start.x, z: middle.z - wall.start.y };
      expect(front.x * toMiddle.x + front.z * toMiddle.z).toBeGreaterThan(0);
    }
  });
});

describe('placing a cabinet by wall and distance along it', () => {
  it('puts it on the south wall where the tape says', () => {
    const cabinet = onWall(room, 'South', 600);
    expect(cabinet.placement.anchor).toEqual({ x: 600, y: 150, z: 0 });
    expect(cabinet.placement.yawDeg).toBe(0);
  });

  it('puts it on the east wall, running back into the room', () => {
    const cabinet = onWall(room, 'East', 900);
    expect(cabinet.placement.anchor).toEqual({ x: 4200, y: 150, z: 900 });
    expect(cabinet.placement.yawDeg).toBe(270);
  });

  it('puts it on the north wall, measured from that wall\'s own start corner', () => {
    // The north wall is walked from (4200,3600) back towards x = 0, so 1200 along it is
    // 4200 − 1200 = 3000.
    const cabinet = onWall(room, 'North', 1200);
    expect(cabinet.placement.anchor).toEqual({ x: 3000, y: 150, z: 3600 });
    expect(cabinet.placement.yawDeg).toBe(180);
  });

  it('puts it on the west wall', () => {
    // Walked from (0,3600) towards the origin, so 600 along is z = 3000.
    const cabinet = onWall(room, 'West', 600);
    expect(cabinet.placement.anchor).toEqual({ x: 0, y: 150, z: 3000 });
    expect(cabinet.placement.yawDeg).toBe(90);
  });

  it('holds a gap behind the carcass off the wall face, not along it', () => {
    // 20mm of scribe behind a cabinet on the east wall moves it 20 into the room: 4200 → 4180.
    const cabinet = onWall(room, 'East', 900, 600, 20);
    expect(cabinet.placement.anchor).toEqual({ x: 4180, y: 150, z: 900 });
  });

  it('gives nothing back for a wall that is not there', () => {
    expect(placeAgainstWall(room, { wallId: 'no-such-wall', along: mm(0), offset: mm(0) }, mm(150)))
      .toBeNull();
  });
});

describe('reading a placement back as a wall and a distance', () => {
  it('round-trips on every wall', () => {
    for (const [name, along] of [
      ['South', 600],
      ['East', 900],
      ['North', 1200],
      ['West', 600],
    ] as const) {
      const cabinet = onWall(room, name, along);
      const anchor = wallAnchorOf(room, cabinet);
      expect(anchor).toEqual({ wallId: wallNamed(room, name).id, along, offset: 0 });
    }
  });

  it('round-trips a cabinet held off the wall', () => {
    const cabinet = onWall(room, 'East', 900, 600, 20);
    expect(wallAnchorOf(room, cabinet)).toEqual({
      wallId: wallNamed(room, 'East').id,
      along: 900,
      offset: 20,
    });
  });

  it('says an island is against no wall at all', () => {
    const project = createEmptyProject('Island');
    const island = createCabinet(
      { typeId: 'base', name: 'Island', width: mm(1200), x: mm(1500), z: mm(1800) },
      project.defaults,
      project.constructions,
    );
    expect(wallAnchorOf(room, island)).toBeNull();
  });

  it('does not claim a cabinet is on a wall it merely points the same way as', () => {
    // Facing +Z like the south wall, but 1800 out into the room — that is an island.
    const project = createEmptyProject('Not against');
    const adrift = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(600), x: mm(600), z: mm(1800) },
      project.defaults,
      project.constructions,
    );
    expect(wallAnchorOf(room, adrift)).toBeNull();
  });

  it('does not claim a cabinet is on a wall past the end of it', () => {
    // On the south wall's line, but 600 beyond the corner at x = 4200.
    const project = createEmptyProject('Past the end');
    const past = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(600), x: mm(4800), z: mm(0) },
      project.defaults,
      project.constructions,
    );
    expect(wallAnchorOf(room, past)).toBeNull();
  });
});

/*
 * Dragging, with a 300mm snap. The cabinet under test is 900 wide and 560 deep and starts on
 * the south wall facing +Z, so while it is being dragged its middle sits 450 to the right of
 * the anchor and 280 in front of it.
 */
describe('snapping a dragged cabinet to a wall', () => {
  const dragged = () => onWall(room, 'South', 0, 900);

  it('turns it and parks it flush on the wall it was pushed towards', () => {
    // Dropped with its anchor at (3400, 1220), so its middle is at (3850, 1500).
    // That is 4200 − 3850 = 350 in front of the east wall, and standing flush the middle
    // would be 280 in front, so there is a 70mm gap left to close.
    const snap = snapToWall(room, dragged(), mm(3400), mm(1220), mm(300));

    expect(snap).not.toBeNull();
    expect(snap!.wall.name).toBe('East');
    expect(snap!.gap).toBe(70);
    // Middle 1500 along the wall, less half the 900 width, puts its left-hand end at 1050.
    expect(snap!.anchor.along).toBe(1050);
    expect(snap!.placement.anchor).toEqual({ x: 4200, y: 150, z: 1050 });
    expect(snap!.placement.yawDeg).toBe(270);
  });

  it('leaves a cabinet out in the middle of the room alone', () => {
    expect(snapToWall(room, dragged(), mm(2100), mm(1800), mm(300))).toBeNull();
  });

  it('keeps the cabinet on the wall rather than hanging it past the corner', () => {
    // Middle at (4950, 380): 100 short of the south wall, but way past its far end. A 900
    // cabinet on a 4200 wall can start at 3300 at most.
    const snap = snapToWall(room, dragged(), mm(4500), mm(100), mm(300));
    expect(snap!.wall.name).toBe('South');
    expect(snap!.anchor.along).toBe(3300);
  });

  it('pushes a cabinet buried in a wall back out flush', () => {
    // Middle only 100 in front of the south wall — 180 of the carcass is inside it.
    const snap = snapToWall(room, dragged(), mm(600), mm(-180), mm(300));
    expect(snap!.gap).toBe(-180);
    expect(snap!.placement.anchor).toEqual({ x: 600, y: 150, z: 0 });
  });

  it('will not snap to the back of a wall', () => {
    // Middle at (2550, −320) — outside the room altogether, looking at the far side.
    expect(snapToWall(room, dragged(), mm(2100), mm(-600), mm(300))).toBeNull();
  });
});

describe('the footprint a cabinet puts on the floor', () => {
  it('is the carcass box, turned to match the wall', () => {
    const cabinet = onWall(room, 'East', 900, 600);
    // Front-left, front-right, back-right, back-left, as drawn on a plan.
    expect(cabinetFootprint(cabinet).map((p) => [p.x, p.z])).toEqual([
      [3640, 900],
      [3640, 1500],
      [4200, 1500],
      [4200, 900],
    ]);
  });

  it('has its centre off the wall and inside the room', () => {
    const cabinet = onWall(room, 'East', 900, 600);
    expect(cabinetFootprintCentre(cabinet)).toEqual({ x: 3920, z: 1200 });
    expect(isInsideRoom(room, mm(3920), mm(1200))).toBe(true);
  });
});

describe('cabinets in an L-shaped room', () => {
  /** The same L as tests/plan.test.ts: 4200 × 3600 with an 1800 × 1500 bite. */
  const lShaped = (): Room => {
    let r = startPlan(room, { length: mm(4200), bearingDeg: 0, name: 'Sink wall' });
    r = appendWall(r, { length: mm(2100), turnDeg: 90 });
    r = appendWall(r, { length: mm(1800), turnDeg: 90 });
    r = appendWall(r, { length: mm(1500), turnDeg: -90 });
    r = appendWall(r, { length: mm(2400), turnDeg: 90 });
    return closePlan(r);
  };

  it('places cabinets against two different walls and keeps both facing in', () => {
    const l = lShaped();
    const sink = onWall(l, 'Sink wall', 600, 900);
    const returnLeg = onWall(l, 'Wall 6', 900, 600);

    // Sink wall runs along +X from the origin: back on z = 0, facing +Z.
    expect(sink.placement.anchor).toEqual({ x: 600, y: 150, z: 0 });
    expect(sink.placement.yawDeg).toBe(0);

    // Wall 6 is the closing wall, walked from (0,3600) up to (0,0): back on x = 0, facing +X.
    expect(returnLeg.placement.anchor).toEqual({ x: 0, y: 150, z: 2700 });
    expect(returnLeg.placement.yawDeg).toBe(90);
  });

  it('flags a cabinet parked in the bite as outside the room', () => {
    const l = lShaped();
    const project = createEmptyProject('L kitchen');
    // 3600 across and 3000 back is inside the outer rectangle but outside the L.
    const stray = createCabinet(
      { typeId: 'base', name: 'B9', width: mm(600), x: mm(3600), z: mm(3000) },
      project.defaults,
      project.constructions,
    );

    const issues = checkLayout({ ...project, room: l, cabinets: [stray] });
    expect(issues.map((i) => i.kind)).toContain('outside-room');
  });

  it('does not flag a cabinet standing hard against a wall', () => {
    // The back corners lie exactly on the outline, which is why the centre is what gets tested.
    const l = lShaped();
    const project = createEmptyProject('L kitchen');
    const issues = checkLayout({
      ...project,
      room: l,
      cabinets: [onWall(l, 'Sink wall', 600, 900), onWall(l, 'Wall 6', 900, 600)],
    });
    expect(issues).toEqual([]);
  });
});
