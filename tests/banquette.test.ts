import { describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { mm } from '../src/core/units.ts';

describe('banquette seating', () => {
  it('starts as a low carcass with a real lift-up lid and no fronts', () => {
    const project = createEmptyProject('Banquette');
    const cabinet = createCabinet(
      { typeId: 'banquette', name: 'BQ1', width: mm(1200), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const built = buildCabinet(cabinet, project);
    expect(cabinet.height).toBe(400);
    expect(cabinet.depth).toBe(500);
    expect(cabinet.options.seatCushionThickness).toBe(80);
    expect(cabinet.options.backCushionAngle).toBe(0);
    expect(cabinet.options.cushionCornerRadius).toBe(18);
    expect(built.panels.map((panel) => panel.name)).toEqual([
      'Side L', 'Side R', 'Bottom', 'Back', 'Divider', 'Lid',
    ]);
  });

  it('ships the requested Warwick Caulfield upholstery choices', () => {
    const project = createEmptyProject('Upholstery');
    expect(project.materials.upholstery?.map((fabric) => fabric.colour)).toEqual([
      'Oatmeal', 'Bone', 'Taupe', 'Rust', 'Moss', 'Pickle', 'Ocean', 'Navy', 'Charcoal',
    ]);
  });
});
