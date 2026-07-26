/**
 * Where benchtop goes.
 *
 * Both bugs this covers were reported from the bench: a top drawn across a tall cabinet, and
 * a top floating over a gap between two cabinets.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { benchtopRuns } from '../src/core/project/benchtop.ts';
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
