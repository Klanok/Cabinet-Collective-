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
import { profileExtent } from '../geom/profile.ts';
import { type DoorStyle, resolveDoorStyle } from '../standards/doorStyles.ts';
import {
  type BuildThicknesses,
  type ResolvedMaterials,
  buildContext,
  thicknessesFor,
  validateContext,
} from './context.ts';
import { type StyledFront, isStyledFrontRole, styleFront } from './frontStyle.ts';
import { boreCabinet } from './boring.ts';
import { type ResolvedHardware, hardwareProblems } from './hardware.ts';
import { cornerRadiusProblems } from './parts.ts';
import { getSpec } from './registry.ts';
import { type MaterialSlot, type PartInstance, resolveBanding } from './spec.ts';
import type { PanelFeature } from '../model/feature.ts';

export interface BuiltCabinet {
  readonly cabinet: Cabinet;
  readonly panels: readonly Panel[];
  /**
   * Dimensional problems found while building. Surfaced rather than thrown: a half-valid
   * cabinet still needs to be visible in the viewport so the user can see what to fix.
   */
  readonly warnings: readonly string[];
  /** The style this cabinet's fronts were machined to, once the override and default resolve. */
  readonly doorStyle: DoorStyle;
  /**
   * The runner and hinge systems this cabinet was built and bored to.
   *
   * Carried out alongside the panels for the same reason `doorStyle` is: the hardware BOM has to
   * say *which* runner at *what* length, and re-resolving it downstream would be a second place
   * that could pick a different one.
   */
  readonly hardware: ResolvedHardware;
}

const resolveMaterials = (cabinet: Cabinet, project: Project): ResolvedMaterials => ({
  carcass: cabinet.materials.carcass ?? project.defaults.carcassMaterialId,
  back: cabinet.materials.back ?? project.defaults.backMaterialId,
  door: cabinet.materials.door ?? project.defaults.doorMaterialId,
  skin: cabinet.materials.skin ?? project.defaults.skinMaterialId,
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
    case 'skin':
      return materials.skin;
  }
};

/**
 * Machine a front to the cabinet's door style.
 *
 * This happens here rather than in the part builders on purpose. Fronts are produced in four
 * places — `doors`, `drawerFronts`, the tall cabinet's split door banks, and whatever emits a
 * false front or an applied end panel next — and a style that only reaches three of them is a
 * kitchen with one plain door in it. One resolution point cannot forget a caller.
 *
 * The upright axis is *derived from the panel's own placement* rather than passed in: a door's
 * length runs up it and a drawer front's runs across it, and that is already recorded in `u`.
 * Reading it back is what stops a vertical groove pattern coming out sideways on the drawers.
 */
const machineFront = (
  instance: PartInstance,
  style: DoorStyle,
  thicknesses: BuildThicknesses,
): StyledFront => {
  if (!isStyledFrontRole(instance.role)) return { features: [], warnings: [] };
  /*
   * A front that already carries a style of its own has been given it deliberately.
   *
   * Tested on the *purpose* rather than on "has any features at all", which is what it used to
   * say. Once hardware boring exists, a door carries hinge cups — so the looser test would have
   * read a bored door as an already-styled one and quietly shipped a plain slab on a shaker
   * kitchen. Exactly the failure §4.3 exists to prevent, arriving by the back door.
   */
  if (instance.features?.some((f) => f.purpose === 'front-style')) {
    return { features: [], warnings: [] };
  }

  const { length, width } = profileExtent(instance.profile);
  const upright =
    instance.placement.u === '+Y' || instance.placement.u === '-Y' ? 'length' : 'width';

  return styleFront(style, {
    length,
    width,
    thickness: thicknesses[instance.material],
    upright,
  });
};

const toPanel = (
  instance: PartInstance,
  cabinetId: string,
  panelId: string,
  materials: ResolvedMaterials,
  styleFeatures: StyledFront,
  boring: readonly PanelFeature[],
): Panel => ({
  id: panelId,
  cabinetId,
  role: instance.role,
  name: instance.name,
  materialId: materialFor(instance.material, materials),
  profile: instance.profile,
  placement: instance.placement,
  features: [...(instance.features ?? []), ...styleFeatures.features, ...boring],
  edgeBanding: resolveBanding(instance.placement, instance.bandedDirections, materials.edgeBand),
  grain: instance.grain,
  forming: instance.forming,
  note: instance.note,
});

export const buildCabinet = (cabinet: Cabinet, project: Project): BuiltCabinet => {
  const spec = getSpec(cabinet.typeId);
  const construction = findConstruction(project.constructions, cabinet.constructionId);
  const materials = resolveMaterials(cabinet, project);
  const doorStyle = resolveDoorStyle(
    project.doorStyles,
    cabinet.doorStyleId,
    project.defaults.doorStyleId,
  );

  // Spec defaults fill any option the cabinet doesn't set. What a corner radius defaults —
  // no doors, no shelves — is applied where a cabinet is created or edited rather than here,
  // so there is one place that decides it and it is visible in the form.
  const merged: Cabinet = {
    ...cabinet,
    options: { ...spec.defaultOptions, ...cabinet.options },
  };
  const thicknesses = thicknessesFor(materials, project.materials);
  const ctx = buildContext(merged, construction, materials, thicknesses, {
    library: project.hardware,
    defaults: project.defaults,
  });

  const warnings = [
    ...validateContext(ctx),
    ...cornerRadiusProblems(ctx),
    ...hardwareProblems(ctx),
    ...(spec.validate?.(ctx) ?? []),
  ];

  // A cabinet whose driving dimensions don't work can't produce meaningful parts. Report and
  // stop rather than emitting negative-sized panels that look plausible in a cutlist.
  if (validateContext(ctx).length > 0) {
    return { cabinet: merged, panels: [], warnings, doorStyle, hardware: ctx.hardware };
  }

  /*
   * Produce every part first, then machine the finished list — twice, for two different reasons
   * that happen to share a shape.
   *
   * The door style is per front and needs nothing but that front's own size. The **hardware** is
   * not: a hinge is a cup in a door and two screws in a side, so the boring pass has to see the
   * doors and the sides at once, and it can only do that once every builder has run. Both are here
   * rather than inside the builders because fronts and sides each come out of several places, and
   * one resolution point cannot forget a caller.
   */
  const produced: { instance: PartInstance; id: string }[] = [];
  for (const rule of spec.parts) {
    rule.produce(ctx).forEach((instance, i) => {
      produced.push({ instance, id: `${cabinet.id}:${rule.key}:${i}` });
    });
  }

  const boring = boreCabinet(ctx, produced.map((p) => p.instance));

  const panels: Panel[] = [];
  // A bank of identical drawer fronts would otherwise report the same fallback three times.
  const styleWarnings = new Set<string>();
  produced.forEach(({ instance, id }, i) => {
    const styled = machineFront(instance, doorStyle, thicknesses);
    styled.warnings.forEach((w) => styleWarnings.add(w));
    panels.push(
      toPanel(instance, cabinet.id, id, materials, styled, boring.perInstance[i] ?? []),
    );
  });

  return {
    cabinet: merged,
    panels,
    warnings: [...warnings, ...styleWarnings, ...boring.warnings],
    doorStyle,
    hardware: ctx.hardware,
  };
};

/** Build every cabinet in the project. */
export const buildProject = (project: Project): readonly BuiltCabinet[] =>
  project.cabinets.map((c) => buildCabinet(c, project));

/** Every panel in the project, flattened — what costing and the cutlist consume. */
export const allPanels = (project: Project): readonly Panel[] =>
  buildProject(project).flatMap((b) => b.panels);
