/**
 * The rule engine's entry point: cabinet + project → panels.
 *
 * Panels are always regenerated here, never cached in the project file. Change a thickness
 * and every part that depends on it moves, because there is nowhere for a stale copy to hide.
 */

import type { Cabinet } from '../model/cabinet.ts';
import { findConstruction } from '../model/construction.ts';
import type { Panel } from '../model/panel.ts';
import type { Project } from '../model/project.ts';
import {
  type ResolvedMaterials,
  buildContext,
  checkThicknessAgainstMethod,
  thicknessesFor,
  validateContext,
} from './context.ts';
import { getSpec } from './registry.ts';
import { type MaterialSlot, type PartInstance, resolveBanding } from './spec.ts';

export interface BuiltCabinet {
  readonly cabinet: Cabinet;
  readonly panels: readonly Panel[];
  /**
   * Dimensional problems found while building. Surfaced rather than thrown: a half-valid
   * cabinet still needs to be visible in the viewport so the user can see what to fix.
   */
  readonly warnings: readonly string[];
}

const resolveMaterials = (cabinet: Cabinet, project: Project): ResolvedMaterials => ({
  carcass: cabinet.materials.carcass ?? project.defaults.carcassMaterialId,
  back: cabinet.materials.back ?? project.defaults.backMaterialId,
  door: cabinet.materials.door ?? project.defaults.doorMaterialId,
  edgeBand: cabinet.materials.edgeBand ?? project.defaults.edgeBandId,
});

const materialFor = (slot: MaterialSlot, materials: ResolvedMaterials): string => {
  switch (slot) {
    case 'carcass':
      return materials.carcass;
    case 'back':
      return materials.back;
    case 'door':
      return materials.door;
  }
};

const toPanel = (
  instance: PartInstance,
  cabinetId: string,
  panelId: string,
  materials: ResolvedMaterials,
): Panel => ({
  id: panelId,
  cabinetId,
  role: instance.role,
  name: instance.name,
  materialId: materialFor(instance.material, materials),
  profile: instance.profile,
  placement: instance.placement,
  features: instance.features ?? [],
  edgeBanding: resolveBanding(instance.placement, instance.bandedDirections, materials.edgeBand),
  grain: instance.grain,
  note: instance.note,
});

export const buildCabinet = (cabinet: Cabinet, project: Project): BuiltCabinet => {
  const spec = getSpec(cabinet.typeId);
  const construction = findConstruction(project.constructions, cabinet.constructionId);
  const materials = resolveMaterials(cabinet, project);

  // Spec defaults fill any option the cabinet doesn't set.
  const merged: Cabinet = {
    ...cabinet,
    options: { ...spec.defaultOptions, ...cabinet.options },
  };
  const thicknesses = thicknessesFor(materials, project.materials);
  const ctx = buildContext(merged, construction, materials, thicknesses);

  const warnings = [
    ...validateContext(ctx),
    ...checkThicknessAgainstMethod(construction, materials, project.materials),
    ...(spec.validate?.(ctx) ?? []),
  ];

  // A cabinet whose driving dimensions don't work can't produce meaningful parts. Report and
  // stop rather than emitting negative-sized panels that look plausible in a cutlist.
  if (validateContext(ctx).length > 0) {
    return { cabinet: merged, panels: [], warnings };
  }

  const panels: Panel[] = [];
  for (const rule of spec.parts) {
    const instances = rule.produce(ctx);
    instances.forEach((instance, i) => {
      panels.push(toPanel(instance, cabinet.id, `${cabinet.id}:${rule.key}:${i}`, materials));
    });
  }

  return { cabinet: merged, panels, warnings };
};

/** Build every cabinet in the project. */
export const buildProject = (project: Project): readonly BuiltCabinet[] =>
  project.cabinets.map((c) => buildCabinet(c, project));

/** Every panel in the project, flattened — what costing and the cutlist consume. */
export const allPanels = (project: Project): readonly Panel[] =>
  buildProject(project).flatMap((b) => b.panels);
