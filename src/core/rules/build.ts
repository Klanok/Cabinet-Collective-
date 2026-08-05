/**
 * The rule engine's entry point: cabinet + project → panels.
 *
 * Panels are always regenerated here, never cached in the project file. Change a thickness
 * and every part that depends on it moves, because there is nowhere for a stale copy to hide.
 */

import type { Mm } from '../units.ts';
import { type Cabinet, isRadiused } from '../model/cabinet.ts';
import { findConstruction } from '../model/construction.ts';
import type { GrainConstraint, Panel, PanelRole } from '../model/panel.ts';
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
import { STYLED_FRONT_ROLES, type StyledFront, isStyledFrontRole, styleFront } from './frontStyle.ts';
import { boreCabinet } from './boring.ts';
import { type ResolvedHardware, hardwareProblems } from './hardware.ts';
import { applyCustomFeatures } from './customFeatures.ts';
import { appliedEndProblems, cornerRadiusProblems } from './parts.ts';
import type { CornerRadius } from './radius.ts';
import type { InsideCornerPlan } from '../model/insideCorner.ts';
import { cornerPlanOf } from './specs/banquetteCorner.ts';
import { getSpec } from './registry.ts';
import { buildRunUnits } from './runUnits.ts';
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
  /**
   * The rounded front corner this cabinet was built with, or `null` for a square one.
   *
   * Carried out for the same reason `hardware` is, and it earns it: a banquette's cushions are
   * not panels, so the only way for them to follow the curve is to read the corner the engine
   * settled on. Reading `options.carcassRadius` instead would draw a curved cushion on a cabinet
   * whose radius the bendy ply could not turn — built square, with a warning saying so.
   */
  readonly radius: CornerRadius | null;
  /**
   * Cabinet-space z of the finished front face — the front of a door or a fixed front.
   *
   * Carried out for the same reason `radius` is, and it earns it the same way: a banquette's
   * cushions are not panels, so the only way for the seat to stand a stated 10mm proud of the
   * **finished** front is to read the plane the engine settled on. Working it out again from the
   * depth plus a standoff plus a board would be a second opinion about where the front of the
   * kitchen is — and the cushion is the one thing on a banquette nobody can check against a
   * cutlist, which is where a second opinion goes unnoticed.
   */
  readonly finishedFrontZ: Mm;
  /**
   * The L-shaped plan of an inside banquette corner, or `null` for every other cabinet.
   *
   * Carried out for the same reason `radius` is, and it earns it for the same reason: the corner
   * unit's cushion is not a panel, so the only way for it to follow the seat is to read the plan the
   * engine settled on. A second reading of "an L with a fillet" is how this unit came to have a
   * quarter disc in the spec and a second quarter in the viewport.
   */
  readonly insideCorner: InsideCornerPlan | null;
  /**
   * Which part rule produced each panel — index-aligned with `panels`.
   *
   * Carried out so the Inspector can offer "the left hand end" as `side-left` and store that,
   * rather than storing a position in the part list. The key is the stable name (§5.12): adding
   * a shelf does not move `side-left`, where it would move part number 7.
   */
  readonly partKeys: readonly PartKey[];
}

/** A part rule's name for one produced panel. */
export interface PartKey {
  /** The rule key — `side-left`, `bottom`, `fronts`. */
  readonly key: string;
  /** Which one, where the rule made several. */
  readonly index: number;
  readonly panelId: string;
  /** What the part is called on the cutlist, so a picker can show it. */
  readonly name: string;
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

/**
 * The parts whose grain is a **choice** rather than a construction fact.
 *
 * The styled fronts, plus the standalone panel. It is deliberately *not* `STYLED_FRONT_ROLES`
 * itself and a standalone panel is deliberately not added to that list: `STYLED_FRONT_ROLES`
 * decides what a **door style routes**, so putting `panel` in it would cut shaker grooves into
 * every filler, scribe and backing piece in the job. The two lists overlap because a door is
 * both a styled front and a part whose grain you choose; they are answering different questions.
 */
export const GRAIN_CHOICE_ROLES: readonly PanelRole[] = [...STYLED_FRONT_ROLES, 'panel'];

const hasChoosableGrain = (role: PanelRole): boolean => GRAIN_CHOICE_ROLES.includes(role);

/**
 * The grain a show part is cut with, once the cabinet has had its say.
 *
 * **A `GrainConstraint` is relative to the part, and the shop thinks about the room.** A door's
 * length runs up it, so `length-along-grain` is a vertical grain; a drawer front's length runs
 * across a bank, so on that part the very same value is a *horizontal* grain. Handing the user
 * that enum would be handing them a control whose meaning changes per part.
 *
 * So the option is stated as the room sees it — vertical or horizontal — and translated here by
 * reading back which way this part's length actually runs. `u` already records it, and
 * `machineFront` reads it the same way a few lines up to keep a V-groove upright on a drawer.
 * This is the same class of trap as writing part-space hardware coordinates by hand: the wrong
 * answer is the right *size* and passes anything that only measures the part.
 *
 * Carcass parts are left alone. Their grain is a construction fact rather than a preference, and
 * on the white melamine most carcasses are cut from it is `any`, which is what lets the nester
 * turn the part for yield. Overriding that would cost board to no visible end.
 *
 * `any` is never produced here: asking for a direction and getting "either" is not an answer.
 */
const grainForShowPart = (
  instance: PartInstance,
  want: 'vertical' | 'horizontal' | undefined,
): GrainConstraint => {
  if (!want || !hasChoosableGrain(instance.role)) return instance.grain;
  const lengthRunsVertically =
    instance.placement.u === '+Y' || instance.placement.u === '-Y';
  return (want === 'vertical') === lengthRunsVertically
    ? 'length-along-grain'
    : 'width-along-grain';
};

const toPanel = (
  instance: PartInstance,
  ownerId: string,
  panelId: string,
  materials: ResolvedMaterials,
  styleFeatures: StyledFront,
  boring: readonly PanelFeature[],
  grain: GrainConstraint,
): Panel => ({
  id: panelId,
  ownerId,
  ownerKind: 'cabinet',
  role: instance.role,
  name: instance.name,
  materialId: materialFor(instance.material, materials),
  finishMaterialId: instance.finish ? materialFor(instance.finish, materials) : undefined,
  profile: instance.profile,
  placement: instance.placement,
  features: [...(instance.features ?? []), ...styleFeatures.features, ...boring],
  edgeBanding: resolveBanding(instance.placement, instance.bandedDirections, materials.edgeBand),
  grain,
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

  // An appliance space is not a box, so the carcass checks are not questions about it.
  const carcassProblems = spec.isCarcass === false ? [] : validateContext(ctx);

  const warnings = [
    ...carcassProblems,
    ...((merged.typeId === 'radius-end' || isRadiused(merged.options)) &&
    materials.skin === 'bendy-ply-3'
      ? [
          'This radiused cabinet still uses the legacy 3mm bendy ply. The shop default is now ' +
            '8mm; upgrading will change former radii, skin lengths and price.',
        ]
      : []),
    ...cornerRadiusProblems(ctx, spec),
    ...appliedEndProblems(ctx, spec),
    ...hardwareProblems(ctx),
    ...(spec.validate?.(ctx) ?? []),
  ];

  // A cabinet whose driving dimensions don't work can't produce meaningful parts. Report and
  // stop rather than emitting negative-sized panels that look plausible in a cutlist.
  if (carcassProblems.length > 0) {
    return {
      cabinet: merged,
      panels: [],
      warnings,
      doorStyle,
      hardware: ctx.hardware,
      radius: ctx.radius,
      finishedFrontZ: ctx.finishedFrontZ,
      insideCorner: cabinet.typeId === 'banquette-corner' ? cornerPlanOf(ctx) : null,
      partKeys: [],
    };
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
  const produced: { instance: PartInstance; id: string; key: string; index: number }[] = [];
  for (const rule of spec.parts) {
    rule.produce(ctx).forEach((instance, i) => {
      produced.push({ instance, id: `${cabinet.id}:${rule.key}:${i}`, key: rule.key, index: i });
    });
  }

  /*
   * Custom features go on before either of those passes, and the order decides real numbers. A
   * notch changes the part's shape and can change its size, so anything measured off the
   * finished part — a runner fixing set back from the front edge of a side, a shaker border
   * sized to the front it is routed into — has to see the notched part rather than the one
   * before it. A feature that will not fit is reported here and the part comes out unchanged.
   */
  const custom = applyCustomFeatures(ctx, spec, produced);
  custom.instances.forEach((instance, i) => {
    produced[i]!.instance = instance;
  });

  const boring = boreCabinet(ctx, produced.map((p) => p.instance));

  const panels: Panel[] = [];
  // A bank of identical drawer fronts would otherwise report the same fallback three times.
  const styleWarnings = new Set<string>();
  produced.forEach(({ instance, id }, i) => {
    const styled = machineFront(instance, doorStyle, thicknesses);
    styled.warnings.forEach((w) => styleWarnings.add(w));
    panels.push(
      toPanel(
        instance,
        cabinet.id,
        id,
        materials,
        styled,
        boring.perInstance[i] ?? [],
        grainForShowPart(instance, merged.options.grainDirection),
      ),
    );
  });

  return {
    cabinet: merged,
    panels,
    warnings: [...warnings, ...custom.warnings, ...styleWarnings, ...boring.warnings],
    doorStyle,
    hardware: ctx.hardware,
    radius: ctx.radius,
    finishedFrontZ: ctx.finishedFrontZ,
    insideCorner: cabinet.typeId === 'banquette-corner' ? cornerPlanOf(ctx) : null,
    partKeys: produced.map((p) => ({
      key: p.key,
      index: p.index,
      panelId: p.id,
      name: p.instance.name,
    })),
  };
};

/** Build every cabinet in the project. */
export const buildProject = (project: Project): readonly BuiltCabinet[] =>
  project.cabinets.map((c) => buildCabinet(c, project));

/**
 * Every panel in the project, flattened — what costing and the cutlist consume.
 *
 * **The run units are in here too.** A shop-made benchtop and a ladder base are cut from sheet
 * stock exactly as a carcass part is, so they belong on the same list; keeping them on a parallel
 * one would be a second representation of a part, which is the thing this codebase exists not to
 * do. A bought-in stone top contributes nothing here and is costed in `costing/benchtopCost.ts`,
 * which is the correct answer rather than an omission — there is no part to cut.
 */
export const allPanels = (project: Project): readonly Panel[] => [
  ...buildProject(project).flatMap((b) => b.panels),
  ...buildRunUnits(project).flatMap((u) => u.panels),
];
