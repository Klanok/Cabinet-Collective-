import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { checkLayout } from '../src/core/project/layout.ts';
import { createCabinet, createEmptyProject, createSampleKitchen, resetIdCounter } from '../src/core/project/factory.ts';
import type { Project } from '../src/core/model/project.ts';

let project: Project;

const withCabinets = (...cabinets: Parameters<typeof createCabinet>[0][]): Project => ({
  ...project,
  cabinets: cabinets.map((c) => createCabinet(c)),
});

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Layout test');
});

describe('layout checks', () => {
  it('passes a run of cabinets butted edge to edge', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      { typeId: 'base', name: 'B2', width: mm(600), x: mm(900) },
      { typeId: 'base', name: 'B3', width: mm(900), x: mm(1500) },
    );
    expect(checkLayout(p)).toEqual([]);
  });

  it('catches two base cabinets fighting over the same wall space', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      { typeId: 'base', name: 'B2', width: mm(600), x: mm(700) },
    );
    const issues = checkLayout(p);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe('overlap');
    expect(issues[0]!.message).toMatch(/B1 and B2 overlap by 200mm/);
  });

  it('lets a wall cabinet sit directly above a base cabinet', () => {
    // Same footprint in plan, but 1500mm up — the commonest arrangement there is.
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      { typeId: 'wall', name: 'W1', width: mm(900), x: mm(0) },
    );
    expect(checkLayout(p)).toEqual([]);
  });

  it('catches a wall cabinet hung low enough to hit the benchtop run', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      { typeId: 'wall', name: 'W1', width: mm(900), x: mm(0), y: mm(600) },
    );
    expect(checkLayout(p).map((i) => i.kind)).toContain('overlap');
  });

  it('ignores cabinets on opposite sides of the room', () => {
    const p = withCabinets(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0), z: mm(0) },
      { typeId: 'base', name: 'B2', width: mm(900), x: mm(0), z: mm(2000) },
    );
    expect(checkLayout(p)).toEqual([]);
  });

  it('catches a cabinet dropped below the floor', () => {
    const p = withCabinets({ typeId: 'base', name: 'B1', width: mm(900), x: mm(0), y: mm(-200) });
    const issues = checkLayout(p);
    expect(issues.map((i) => i.kind)).toContain('below-floor');
    expect(issues[0]!.message).toMatch(/200mm below the floor/);
  });

  it('clears the sample kitchen', () => {
    expect(checkLayout(createSampleKitchen())).toEqual([]);
  });
});
