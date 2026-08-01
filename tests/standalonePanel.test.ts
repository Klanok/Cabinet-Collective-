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
