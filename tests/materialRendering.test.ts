import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { findSheet } from '../src/core/model/material.ts';
import { mm } from '../src/core/units.ts';

describe('supplier material rendering inputs', () => {
  it('gives wall-cabinet doors the same selected front material as base doors', () => {
    const project = createEmptyProject('Textures');
    const materialId = 'poly-notaio-walnut-16';
    for (const typeId of ['base', 'wall'] as const) {
      const cabinet = createCabinet(
        { typeId, name: typeId, width: mm(900), x: mm(0) },
        project.defaults,
        project.constructions,
      );
      const built = buildCabinet(
        { ...cabinet, materials: { ...cabinet.materials, door: materialId } },
        project,
      );
      expect(built.panels.filter((panel) => panel.role === 'door').map((panel) => panel.materialId))
        .toEqual([materialId, materialId]);
    }
  });

  it('ships a real local full-sheet image for every textured board', async () => {
    const project = createEmptyProject('Textures');
    const textured = project.materials.sheets.filter((sheet) => sheet.texture);
    expect(textured.length).toBeGreaterThanOrEqual(6);
    for (const sheet of textured) {
      const texture = findSheet(project.materials, sheet.id).texture!;
      expect(texture.url).toMatch(/^\/materials\/board\/.+\.jpg$/);
      expect(texture.repeatLength).toBe(3600);
      expect(texture.repeatWidth).toBe(1800);
      await expect(access(`public${texture.url}`)).resolves.toBeUndefined();
    }
  });

  it('ships every Warwick upholstery texture with the app', async () => {
    const project = createEmptyProject('Upholstery');
    for (const fabric of project.materials.upholstery ?? []) {
      expect(fabric.textureUrl).toMatch(/^\/materials\/upholstery\/.+\.jpg$/);
      await expect(access(`public${fabric.textureUrl}`)).resolves.toBeUndefined();
    }
  });
});
