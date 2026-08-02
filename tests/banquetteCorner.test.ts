import { describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { mm } from '../src/core/units.ts';
import { isRectangular } from '../src/core/geom/profile.ts';

describe('inside-corner banquette', () => {
  it('starts as a square quarter-circle connector at banquette height', () => {
    const project = createEmptyProject('Corner banquette');
    const cabinet = createCabinet(
      { typeId: 'banquette-corner', name: 'BQC1', width: mm(500), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const built = buildCabinet(cabinet, project);

    expect(cabinet.width).toBe(500);
    expect(cabinet.depth).toBe(500);
    expect(cabinet.height).toBe(400);
    expect(cabinet.placement.anchor.y).toBe(0);
    expect(built.warnings).toEqual([]);
    expect(built.panels.filter((panel) => panel.role === 'former').length).toBeGreaterThan(1);
    expect(built.panels.filter((panel) => panel.role === 'skin').length).toBe(2);
    expect(built.panels.filter((panel) => panel.role === 'back').length).toBe(2);
    const lid = built.panels.find((panel) => panel.name === 'Corner lid');
    expect(lid).toBeDefined();
    expect(isRectangular(lid!.profile)).toBe(false);
  });

  it('reports dimensions that cannot describe one circular corner', () => {
    const project = createEmptyProject('Bad corner');
    const cabinet = createCabinet(
      { typeId: 'banquette-corner', name: 'BQC1', width: mm(600), depth: mm(500), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    expect(buildCabinet(cabinet, project).warnings.join(' ')).toContain('width and depth');
  });
});
