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
 *
 * ## Butting one cabinet against the next
 *
 * The east wall is the case that matters and it is why these tests exist. A cabinet on it has
 * yaw 270, so its **run axis is world +Z** — two cabinets side by side there share an X entirely.
 * Anything that measured "next to" along world X would call them neighbours when they are one
 * behind the other, and would never call them neighbours when they are side by side. That is the
 * same mistake `project/runs.ts` had to be fixed for.
 *
 *   a 600-wide cabinet 900 along the east wall occupies z 900 → 1500 at x 4200
 *   the next one butted to its right-hand end starts at z 1500, anchor (4200, 150, 1500)
 *   the one butted to its left-hand end ends at z 900, so a 900-wide one starts at z 0
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
  snapToNeighbour,
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


describe('butting one cabinet against the next', () => {
  // Ids only have to be stable and distinct here — the snap never looks at the room.
  beforeEach(resetIdCounter);

  /** A base cabinet standing on the south wall, where the run axis is world +X. */
  const onSouth = (name: string, x: number, width = 600) =>
    createCabinet({ typeId: 'base', name, width: mm(width), x: mm(x), z: mm(0) });

  /** The same on the east wall, where the run axis is world +Z and X is constant. */
  const onEast = (name: string, along: number, width = 600) =>
    createCabinet({
      typeId: 'base',
      name,
      width: mm(width),
      x: mm(4200),
      z: mm(along),
      yawDeg: 270,
    });

  it('closes a small gap onto the neighbour’s right-hand end', () => {
    const fixed = onSouth('B1', 0);
    const dragged = onSouth('B2', 600);
    // Dropped 20mm short of where it belongs.
    const snap = snapToNeighbour([fixed, dragged], dragged, mm(580), mm(0), mm(60));

    expect(snap?.neighbour.name).toBe('B1');
    expect(snap?.end).toBe('right');
    expect(snap?.placement.anchor.x).toBe(600);
    expect(snap?.gap).toBe(20);
  });

  it('closes onto the left-hand end too, from the other side', () => {
    const fixed = onSouth('B1', 900);
    const dragged = onSouth('B2', 0);
    // A 600 cabinet butted to the left of one starting at 900 has to start at 300.
    const snap = snapToNeighbour([fixed, dragged], dragged, mm(315), mm(0), mm(60));

    expect(snap?.end).toBe('left');
    expect(snap?.placement.anchor.x).toBe(300);
  });

  it('snaps to the outside face of an applied end', () => {
    const fixedBase = onSouth('B1', 0);
    const fixed = {
      ...fixedBase,
      options: { ...fixedBase.options, appliedEnds: ['right'] as const },
    };
    const dragged = onSouth('B2', 618);
    const snap = snapToNeighbour(
      [fixed, dragged],
      dragged,
      mm(600),
      mm(0),
      mm(60),
      () => mm(18),
    );

    expect(snap?.end).toBe('right');
    expect(snap?.placement.anchor.x).toBe(618);
  });

  it('includes applied ends on both contacting cabinets', () => {
    const fixedBase = onSouth('B1', 0);
    const draggedBase = onSouth('B2', 636);
    const fixed = {
      ...fixedBase,
      options: { ...fixedBase.options, appliedEnds: ['right'] as const },
    };
    const dragged = {
      ...draggedBase,
      options: { ...draggedBase.options, appliedEnds: ['left'] as const },
    };
    const snap = snapToNeighbour(
      [fixed, dragged],
      dragged,
      mm(620),
      mm(0),
      mm(60),
      () => mm(18),
    );

    expect(snap?.placement.anchor.x).toBe(636);
  });

  it('snaps outside a left applied end from the other side', () => {
    const fixedBase = onSouth('B1', 900);
    const fixed = {
      ...fixedBase,
      options: { ...fixedBase.options, appliedEnds: ['left'] as const },
    };
    const dragged = onSouth('B2', 282);
    const snap = snapToNeighbour(
      [fixed, dragged],
      dragged,
      mm(300),
      mm(0),
      mm(60),
      () => mm(18),
    );

    expect(snap?.end).toBe('left');
    expect(snap?.placement.anchor.x).toBe(282);
  });

  it('uses the applied-end thickness down a rotated wall run', () => {
    const fixedBase = onEast('E1', 900);
    const fixed = {
      ...fixedBase,
      options: { ...fixedBase.options, appliedEnds: ['right'] as const },
    };
    const dragged = onEast('E2', 1518);
    const snap = snapToNeighbour(
      [fixed, dragged],
      dragged,
      mm(4200),
      mm(1500),
      mm(60),
      () => mm(18),
    );

    expect(snap?.placement.anchor.x).toBe(4200);
    expect(snap?.placement.anchor.z).toBe(1518);
  });

  it('lines the run up across as well as along', () => {
    const fixed = onSouth('B1', 0);
    const dragged = onSouth('B2', 600);
    // Dropped 25mm out into the room as well as 10mm short along the run.
    const snap = snapToNeighbour([fixed, dragged], dragged, mm(590), mm(25), mm(60));

    expect(snap?.placement.anchor.x).toBe(600);
    // Back in line with the neighbour's back, which is what makes a run straight.
    expect(snap?.placement.anchor.z).toBe(0);
    // hypot(10, 25) — how far it actually moved, not just how far along.
    expect(snap?.gap).toBeCloseTo(Math.hypot(10, 25), 6);
  });

  /**
   * The one that would fail on a world-X test. Both cabinets sit at x = 4200 and differ only in Z,
   * so "how far apart in X" is zero whether they are butted or a metre apart.
   */
  it('works down a wall whose run axis is world Z, not world X', () => {
    const fixed = onEast('E1', 900);
    const dragged = onEast('E2', 1500);
    const snap = snapToNeighbour([fixed, dragged], dragged, mm(4200), mm(1470), mm(60));

    expect(snap?.end).toBe('right');
    expect(snap?.placement.anchor.z).toBe(1500);
    expect(snap?.placement.anchor.x).toBe(4200);
    expect(snap?.gap).toBe(30);
  });

  it('does not mistake one behind the other for one beside it', () => {
    const fixed = onEast('E1', 900);
    const dragged = onEast('E2', 900);
    // Directly in front of the neighbour: same Z entirely, 600 out into the room. On a world-X
    // test these two share an X and would read as touching.
    expect(snapToNeighbour([fixed, dragged], dragged, mm(3600), mm(900), mm(60))).toBeNull();
  });

  it('leaves a cabinet on the return leg of an L alone', () => {
    const fixed = onSouth('B1', 0);
    const returning = onEast('E1', 0);
    // Geometrically close to the south run, but turned 270° — a corner, not a butt joint.
    expect(snapToNeighbour([fixed, returning], returning, mm(600), mm(0), mm(60))).toBeNull();
  });

  it('does not snap a wall unit onto the base cabinet under it', () => {
    const base = onSouth('B1', 0);
    const wall = createCabinet({ typeId: 'wall', name: 'W1', width: mm(600), x: mm(600), z: mm(0) });
    // Right above the run and perfectly placed along it — but 1500 off the floor.
    expect(snapToNeighbour([base, wall], wall, mm(590), mm(0), mm(60))).toBeNull();
  });

  it('snaps a floor-level standalone panel to a cabinet on its kick', () => {
    const base = onSouth('B1', 0);
    const panel = createCabinet({
      typeId: 'panel',
      name: 'P1',
      width: mm(100),
      x: mm(600),
      z: mm(0),
    });
    const snap = snapToNeighbour([base, panel], panel, mm(590), mm(0), mm(60));

    expect(panel.placement.anchor.y).toBe(0);
    expect(base.placement.anchor.y).toBeGreaterThan(0);
    expect(snap?.placement.anchor.x).toBe(600);
  });

  it('rotates a standalone panel square with the cabinet it snaps to', () => {
    const base = onSouth('B1', 0);
    const panel = {
      ...createCabinet({ typeId: 'panel', name: 'P1', width: mm(100), x: mm(600), z: mm(0) }),
      placement: { anchor: { x: mm(600), y: mm(0), z: mm(0) }, yawDeg: 90 },
    };
    const snap = snapToNeighbour([base, panel], panel, mm(590), mm(0), mm(60));
    expect(snap?.placement.yawDeg).toBe(base.placement.yawDeg);
    expect(snap?.placement.anchor.x).toBe(600);
  });

  it('never snaps a cabinet to itself', () => {
    const only = onSouth('B1', 0);
    expect(snapToNeighbour([only], only, mm(10), mm(0), mm(60))).toBeNull();
  });

  it('lets go beyond the snap distance', () => {
    const fixed = onSouth('B1', 0);
    const dragged = onSouth('B2', 600);
    expect(snapToNeighbour([fixed, dragged], dragged, mm(520), mm(0), mm(60))).toBeNull();
    expect(snapToNeighbour([fixed, dragged], dragged, mm(545), mm(0), mm(60))).not.toBeNull();
  });

  it('takes the nearer of two neighbours rather than the first it finds', () => {
    const left = onSouth('B1', 0);
    const right = onSouth('B3', 1240);
    const dragged = onSouth('B2', 600);
    // The gap between them is 640 for a 600 cabinet, so both ends are in reach: 600 on the left,
    // 640 on the right. Dropped at 625 it is 25 from one and 15 from the other.
    const snap = snapToNeighbour([left, right, dragged], dragged, mm(625), mm(0), mm(60));
    expect(snap?.neighbour.name).toBe('B3');
    expect(snap?.placement.anchor.x).toBe(640);
  });

  it('butts a narrower cabinet flush at the back, proud at the front', () => {
    const deep = onSouth('B1', 0);
    const shallow = createCabinet({
      typeId: 'base',
      name: 'B2',
      width: mm(450),
      depth: mm(400),
      x: mm(600),
      z: mm(0),
    });
    const snap = snapToNeighbour([deep, shallow], shallow, mm(590), mm(0), mm(60));
    // The anchor is the back-left corner, so lining the anchors up lines the backs up — which is
    // what happens against a wall, and leaves the shallower one 160 shy at the front.
    expect(snap?.placement.anchor.z).toBe(0);
    expect(snap?.placement.anchor.x).toBe(600);
  });

  it('squares a cabinet up with its neighbour, not merely near it', () => {
    const fixed = onSouth('B1', 0);
    const askew = { ...onSouth('B2', 600), placement: { anchor: { x: mm(590), y: mm(150), z: mm(0) }, yawDeg: 0 } };
    const snap = snapToNeighbour([fixed, askew], askew, mm(590), mm(0), mm(60));
    expect(snap?.placement.yawDeg).toBe(fixed.placement.yawDeg);
  });
});
