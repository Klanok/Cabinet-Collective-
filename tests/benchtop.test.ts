/**
 * Where benchtop goes.
 *
 * Both bugs this covers were reported from the bench: a top drawn across a tall cabinet, and
 * a top floating over a gap between two cabinets.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { type Mm, mm } from '../src/core/units.ts';
import { benchtopRuns } from '../src/core/project/benchtop.ts';
import { placeAgainstWall } from '../src/core/project/wallPlacement.ts';
import { rectangularRoom } from '../src/core/model/room.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import type { Project } from '../src/core/model/project.ts';

let project: Project;

const withCabinets = (...args: Parameters<typeof createCabinet>[0][]): Project => ({
  ...project,
  cabinets: args.map((a) => createCabinet(a, project.defaults, project.constructions)),
});

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Benchtop test');
});

describe('benchtop runs', () => {
  it('covers a continuous run of base cabinets with a single top', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      { typeId: 'drawer-bank', name: 'D1', width: mm(600), x: mm(900) },
      { typeId: 'base', name: 'B2', width: mm(900), x: mm(1500) },
    );
    const runs = benchtopRuns(p);

    expect(runs).toHaveLength(1);
    expect(runs[0]!.startX).toBe(0);
    expect(runs[0]!.length).toBe(2400);
    expect(runs[0]!.cabinetIds).toHaveLength(3);
  });

  it('does not run benchtop across a tall cabinet', () => {
    // A tall cabinet stands between two base runs — it goes past bench height, so the top
    // has to stop and start again.
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      { typeId: 'tall', name: 'T1', width: mm(600), x: mm(900) },
      { typeId: 'base', name: 'B2', width: mm(900), x: mm(1500) },
    );
    const runs = benchtopRuns(p);

    expect(runs).toHaveLength(2);
    expect(runs[0]!.startX).toBe(0);
    expect(runs[0]!.length).toBe(900);
    expect(runs[1]!.startX).toBe(1500);
    expect(runs[1]!.length).toBe(900);
    // The tall cabinet is under no benchtop at all.
    const covered = runs.flatMap((r) => r.cabinetIds);
    const tall = p.cabinets.find((c) => c.typeId === 'tall')!;
    expect(covered).not.toContain(tall.id);
  });

  it('does not float benchtop over a gap', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      // 600mm hole — a dishwasher or a fridge space.
      { typeId: 'base', name: 'B2', width: mm(900), x: mm(1500) },
    );
    const runs = benchtopRuns(p);

    expect(runs).toHaveLength(2);
    expect(runs.map((r) => [r.startX, r.length])).toEqual([
      [0, 900],
      [1500, 900],
    ]);
  });

  it('ignores wall cabinets entirely', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      { typeId: 'wall', name: 'W1', width: mm(900), x: mm(0) },
    );
    const runs = benchtopRuns(p);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.cabinetIds).toHaveLength(1);
  });

  it('gives no benchtop at all when there are no bench-height cabinets', () => {
    expect(benchtopRuns(withCabinets({ typeId: 'wall', name: 'W1', width: mm(900), x: mm(0) }))).toEqual(
      [],
    );
    expect(benchtopRuns(withCabinets({ typeId: 'tall', name: 'T1', width: mm(600), x: mm(0) }))).toEqual(
      [],
    );
    expect(benchtopRuns(project)).toEqual([]);
  });

  it('breaks the run when two cabinets are at different heights', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      // An island or a raised section — a single flat top can't span both.
      { typeId: 'base', name: 'B2', width: mm(900), x: mm(900), height: mm(900) },
    );
    expect(benchtopRuns(p)).toHaveLength(2);
  });

  it('breaks the run when two cabinets back onto different walls', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0), z: mm(0) },
      { typeId: 'base', name: 'B2', width: mm(900), x: mm(900), z: mm(1200) },
    );
    expect(benchtopRuns(p)).toHaveLength(2);
  });

  it('sits the top on the carcasses and takes the deepest one', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0), depth: mm(560) },
      { typeId: 'base', name: 'B2', width: mm(600), x: mm(900), depth: mm(600) },
    );
    const run = benchtopRuns(p)[0]!;
    // 150 kick + 720 carcass.
    expect(run.carcassTopY).toBe(870);
    expect(run.carcassDepth).toBe(600);
    expect(run.backZ).toBe(0);
  });

  /*
   * Runs that don't lie along X.
   *
   * The room is the shipped 4200 × 3600 rectangle. Down the east wall a cabinet faces −X at
   * yaw 270, and its own width runs to world +Z — so two touching cabinets there share an X
   * entirely and are told apart only by Z. Sorting a run by X, as this used to, would have
   * called them one cabinet in the same place.
   *
   *   B1  900 wide, 900 along the east wall  → anchor (4200, 150, 900),  occupies z  900→1800
   *   B2  600 wide, 1800 along               → anchor (4200, 150, 1800), occupies z 1800→2400
   *   one top, 1500 long, starting at (4200, 900), facing yaw 270
   */
  const eastWall = () => rectangularRoom('room-1', 'Kitchen', mm(4200), mm(3600), mm(2400)).walls[1]!;

  const againstEastWall = (name: string, width: Mm, along: Mm) => {
    const wall = eastWall();
    const cabinet = createCabinet(
      { typeId: 'base', name, width, x: mm(0) },
      project.defaults,
      project.constructions,
    );
    return {
      ...cabinet,
      placement: placeAgainstWall(
        { ...project.room, walls: [wall] },
        { wallId: wall.id, along, offset: mm(0) },
        cabinet.placement.anchor.y,
      )!,
    };
  };

  it('joins a run down a wall that runs in Z, not X', () => {
    const runs = benchtopRuns({
      ...project,
      cabinets: [
        againstEastWall('B1', mm(900), mm(900)),
        againstEastWall('B2', mm(600), mm(1800)),
      ],
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]!.length).toBe(1500);
    expect(runs[0]!.startX).toBe(4200);
    expect(runs[0]!.backZ).toBe(900);
    expect(runs[0]!.yawDeg).toBe(270);
    expect(runs[0]!.carcassTopY).toBe(870);
  });

  it('still breaks that run over a gap', () => {
    // 600 of daylight between them — a dishwasher, turned to face the other way.
    const runs = benchtopRuns({
      ...project,
      cabinets: [
        againstEastWall('B1', mm(900), mm(900)),
        againstEastWall('B2', mm(600), mm(2400)),
      ],
    });
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.length)).toEqual([900, 600]);
  });

  it('gives a corner run of an L-shaped kitchen two tops, not one', () => {
    // One cabinet on the south wall, one down the east wall. They touch at the corner but
    // face different ways, so they cannot be under the same flat slab.
    const south = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(3300), z: mm(0) },
      project.defaults,
      project.constructions,
    );
    const runs = benchtopRuns({
      ...project,
      cabinets: [south, againstEastWall('B2', mm(900), mm(560))],
    });

    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.yawDeg).sort()).toEqual([0, 270]);
  });

  it('covers the sample kitchen in one unbroken top', () => {
    const runs = benchtopRuns({
      ...project,
      cabinets: [
        createCabinet({ typeId: 'base', name: 'B1', width: mm(900), x: mm(0) }, project.defaults, project.constructions),
        createCabinet({ typeId: 'drawer-bank', name: 'D1', width: mm(600), x: mm(900) }, project.defaults, project.constructions),
        createCabinet({ typeId: 'base', name: 'B2', width: mm(600), x: mm(1500) }, project.defaults, project.constructions),
        createCabinet({ typeId: 'base', name: 'B3', width: mm(900), x: mm(2100) }, project.defaults, project.constructions),
      ],
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.length).toBe(3000);
  });
});
