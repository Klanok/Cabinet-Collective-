import { describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { actualThicknessOf, findSheet } from '../src/core/model/material.ts';
import { panelExtent } from '../src/core/model/panel.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';

describe('standalone panel', () => {
  it('produces one material-driven, fully edged panel', () => {
    resetIdCounter();
    const project = createEmptyProject('Panels');
    const cabinet = createCabinet(
      { typeId: 'panel', name: 'Loose end', width: mm(650), height: mm(2300), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const built = buildCabinet(cabinet, project);

    expect(built.warnings).toEqual([]);
    expect(built.panels).toHaveLength(1);
    const panel = built.panels[0]!;
    expect(panel.role).toBe('panel');
    expect(panel.materialId).toBe(project.defaults.carcassMaterialId);
    expect(panelExtent(panel)).toEqual({ length: mm(2300), width: mm(650) });
    expect(Object.keys(panel.edgeBanding).sort()).toEqual(['L1', 'L2', 'W1', 'W2']);
    expect(actualThicknessOf(findSheet(project.materials, panel.materialId))).toBe(16);
  });

  it('uses a selected sheet without an independent manufacturing thickness', () => {
    const project = createEmptyProject('Panels');
    const cabinet = {
      ...createCabinet(
        { typeId: 'panel', name: 'Backing', width: mm(900), height: mm(1200), x: mm(0) },
        project.defaults,
        project.constructions,
      ),
      materials: { carcass: 'mdf-raw-18' },
      // Deliberately unrelated: this compatibility footprint must not size the manufactured part.
      depth: mm(99),
    };
    const panel = buildCabinet(cabinet, project).panels[0]!;
    expect(panel.materialId).toBe('mdf-raw-18');
    expect(actualThicknessOf(findSheet(project.materials, panel.materialId))).toBe(18);
  });
});

/**
 * Grain on a loose panel.
 *
 * Asked for from the bench after the per-cabinet control shipped for fronts: *"standalone panels
 * need grain direction"*. A loose panel is nothing but a show part, so it is in
 * `GRAIN_CHOICE_ROLES` — but pointedly **not** in `STYLED_FRONT_ROLES`, and the last test here is
 * what keeps those two apart.
 */
describe('standalone panel grain', () => {
  const panelOf = (options: Record<string, unknown> = {}, styleId?: string) => {
    const base = createEmptyProject('Grain');
    const project = styleId
      ? { ...base, defaults: { ...base.defaults, doorStyleId: styleId } }
      : base;
    const cabinet = createCabinet(
      { typeId: 'panel', name: 'Loose end', width: mm(650), height: mm(2300), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    return buildCabinet({ ...cabinet, options: { ...cabinet.options, ...options } }, project)
      .panels[0]!;
  };

  it('runs the grain up the panel when nothing is asked for', () => {
    const panel = panelOf();
    expect(panel.placement.u).toBe('+Y'); // length runs up the part
    expect(panel.grain).toBe('length-along-grain');
  });

  it('turns the grain across the panel when asked for horizontal', () => {
    // Its length runs vertically, so a horizontal grain has to cross the length. The panel is
    // still cut 2300 x 650 — only the constraint moves, which is what tells the nester to turn it.
    const panel = panelOf({ grainDirection: 'horizontal' });
    expect(panel.grain).toBe('width-along-grain');
    expect(panelExtent(panel)).toEqual({ length: mm(2300), width: mm(650) });
  });

  it('keeps vertical as vertical when asked for it explicitly', () => {
    expect(panelOf({ grainDirection: 'vertical' }).grain).toBe('length-along-grain');
  });

  it('is still never routed by a door style, whatever its grain', () => {
    // The reason `panel` is in GRAIN_CHOICE_ROLES and not in STYLED_FRONT_ROLES. A filler or a
    // scribe has no business coming off the machine with shaker grooves in it.
    const panel = panelOf({ grainDirection: 'horizontal' }, 'shaker-57');
    expect(panel.features.filter((f) => f.purpose === 'front-style')).toEqual([]);
  });
});
