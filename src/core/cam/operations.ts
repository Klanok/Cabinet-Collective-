/**
 * Phase 4 — panels plus a nest become an ordered list of machining operations.
 *
 * Everything this needs already existed. `PanelFeature[]` has carried parametric machining intent
 * since Phase 1 and §4.6 filled it in bulk; §4.8's nest says where each part sits on which sheet.
 * This layer is the join, and the fact that it needed no change to either is the test of §2's rule
 * that features are attached to panels rather than baked into geometry — CAM reads the intent
 * directly instead of trying to recover it from a mesh.
 *
 * ## The one decision that is CAM's own
 *
 * **Which way up each part is laid.** The nest does not care — a saw cuts a rectangle out of a
 * sheet whichever face is up. A router cares completely: the spindle reaches the face that is
 * upward and nothing else, and laying a part the wrong way up mirrors every hole in it. See
 * `cam/sheetSpace.ts`, which owns that mapping and the arc reversal it implies.
 *
 * ## What is not machined, and is said out loud
 *
 * A nested program works **one face of the sheet**. So:
 *
 *   - a part machined on one face is laid that face up and comes out complete;
 *   - a part machined on neither is cut out and nothing else;
 *   - a part machined on **both** — a shaker door, recessed on the show face and bored in the back
 *     — gets the busier face and is listed in `needsSecondSetup`. Half-machining a part quietly is
 *     the failure this exists to prevent.
 */

import { type Mm, mm } from '../units.ts';
import type { Vec2 } from '../geom/vec.ts';
import { type Vertex2 } from '../geom/arc.ts';
import { reversePolygon } from '../geom/profile.ts';
import {
  type MachiningFace,
  type PanelFeature,
  cutWidthAtDepth,
} from '../model/feature.ts';
import { findToolOrNull } from '../library/tools.ts';
import { type Panel, panelExtent } from '../model/panel.ts';
import { actualThicknessOf, findSheet } from '../model/material.ts';
import type { Project } from '../model/project.ts';
import { type MaterialNest, type ProjectNest, nestProject } from '../nest/nest.ts';
import { buildProject } from '../rules/build.ts';
import { buildRunUnits } from '../rules/runUnits.ts';
import {
  type Operation,
  type SheetProgram,
  orderOperations,
} from './operation.ts';
import { offsetRingOutward } from './offset.ts';
import { type Lay, faceToLayUp, partPathToSheet, partPointToSheet, partRingToSheet } from './sheetSpace.ts';

/** What the machine needs to know about itself before a program can be written. */
export interface CamSetup {
  /** The cutter parts are cut out with. Straight-sided; its diameter sets the offset. */
  readonly partCutterToolId: string;
  /**
   * Material left holding each part in the sheet after its perimeter is cut.
   *
   * Zero cuts clean through. See `ContourOperation.leaveUncut` for why that is a decision and not
   * a detail.
   */
  readonly leaveUncut: Mm;
  /** How far past the underside of the board a through cut goes, into the spoilboard. */
  readonly throughOvercut: Mm;
}

const featureFace = (f: PanelFeature): MachiningFace | null =>
  f.kind === 'cutout' ? null : f.face;

/** How much work a face carries, for deciding which way up a two-sided part goes. */
const weightOfFace = (features: readonly PanelFeature[], face: MachiningFace): number =>
  features.reduce((sum, f) => {
    if (featureFace(f) !== face) return sum;
    return sum + (f.kind === 'drill-line' ? f.count : 1);
  }, 0);

/** A stable id, so two runs of the same job produce the same program text. */
const opId = (panelId: string, suffix: string): string => `${panelId}:${suffix}`;

/**
 * How deep a perimeter is cut — and the two settings that decide it are **mutually exclusive**.
 *
 * This was wrong first time in a way worth recording, because both numbers looked independent and
 * are not. `throughOvercut` says how far *past* the board to go, into the spoilboard; `leaveUncut`
 * says how much material to *leave*, so the part stays in the sheet. Applying both — cut to
 * `thickness + overcut`, then back off by `leaveUncut` — came out at 16.3mm into 16mm board, which
 * is not an onion skin at all. It is a clean through cut with a smaller overcut, and every small
 * part on the sheet would have come loose under the spindle exactly as if the setting had been
 * left at zero.
 *
 * So: leave something and you never reach the underside; leave nothing and you go past it. The two
 * cases do not overlap and there is no arithmetic that does both.
 */
export const perimeterDepth = (thickness: Mm, setup: CamSetup): Mm =>
  setup.leaveUncut > 0
    ? mm(thickness - setup.leaveUncut)
    : mm(thickness + setup.throughOvercut);

/**
 * One panel's features, mapped onto the sheet.
 *
 * Features on the face that is *down* are skipped and counted — the caller turns that into the
 * `needsSecondSetup` list. Nothing is silently dropped.
 */
const featureOperations = (
  panel: Panel,
  lay: Lay,
  setup: CamSetup,
  thickness: Mm,
  warnings: string[],
): { operations: Operation[]; unreachable: number } => {
  const operations: Operation[] = [];
  let unreachable = 0;
  const base = { partId: panel.id, partName: panel.name };

  for (const f of panel.features) {
    const face = featureFace(f);
    // A cutout goes right through, so it is reachable whichever way the part is laid.
    if (face !== null && face !== lay.faceUp) {
      unreachable += 1;
      continue;
    }

    switch (f.kind) {
      case 'drill':
        operations.push({
          ...base,
          kind: 'bore',
          id: opId(panel.id, f.id),
          purpose: f.purpose,
          at: partPointToSheet(f.at, lay),
          diameter: f.diameter,
          depth: f.depth,
          through: f.depth >= thickness,
        });
        break;

      case 'drill-line':
        /*
         * Expanded into one bore each, and this is the *second* place that expansion happens — the
         * drilling CSV is the other (§4.6: a row of system holes stays one `drill-line`, because
         * that is what the operation is). Both expand for the same reason: a person at a borer and
         * a spindle at a sheet both want positions. The model keeps the pitch, which is what lets a
         * machine with a drill bank put the row down in one hit if its post knows how.
         */
        for (let i = 0; i < f.count; i++) {
          const at = partPointToSheet(
            { x: mm(f.start.x + f.step.x * i), y: mm(f.start.y + f.step.y * i) },
            lay,
          );
          operations.push({
            ...base,
            kind: 'bore',
            id: opId(panel.id, `${f.id}#${i + 1}`),
            purpose: f.purpose,
            at,
            diameter: f.diameter,
            depth: f.depth,
            through: f.depth >= thickness,
          });
        }
        break;

      case 'pocket': {
        const toolId = f.toolId ?? setup.partCutterToolId;
        operations.push({
          ...base,
          kind: 'pocket',
          id: opId(panel.id, f.id),
          purpose: f.purpose,
          outline: partRingToSheet(f.outline as readonly Vertex2[], lay),
          depth: f.depth,
          toolId,
        });
        break;
      }

      case 'profiled-cut':
        operations.push({
          ...base,
          kind: 'profiled',
          id: opId(panel.id, f.id),
          purpose: f.purpose,
          path: partPathToSheet(f.path, lay),
          depth: f.depth,
          toolId: f.toolId,
        });
        break;

      case 'groove': {
        /*
         * A groove is a flat-bottomed cut of a stated width, so it needs a cutter that width or
         * narrower. Anything narrower would have to make several passes and this does not yet work
         * that out — so a groove wider than the cutter is reported rather than cut undersize, which
         * is the failure that looks fine until the back panel will not go in.
         */
        const tool = findToolOrNull(setup.partCutterToolId);
        const cut = tool ? cutWidthAtDepth(tool, f.depth) : 0;
        if (cut + 1e-6 < f.width) {
          warnings.push(
            `"${panel.name}": a ${f.width}mm groove needs more than one pass with the ` +
              `${cut}mm cutter, which is not worked out yet. Cut it on the saw.`,
          );
          break;
        }
        operations.push({
          ...base,
          kind: 'contour',
          id: opId(panel.id, f.id),
          purpose: f.purpose,
          path: partPathToSheet(f.path, lay).map((p) => ({ x: p.x, y: p.y })),
          closed: false,
          depth: f.depth,
          toolId: setup.partCutterToolId,
        });
        break;
      }

      case 'cutout': {
        /*
         * A hole through the part. The tool runs **inside** it, which is the opposite offset to a
         * perimeter — offsetting a hole outward would cut it oversize by a cutter diameter. The
         * ring is reversed so its inside becomes its outside, offset, and reversed back.
         */
        const ring = partRingToSheet(f.outline, lay);
        const tool = findToolOrNull(setup.partCutterToolId);
        const radius =
          tool && tool.section.kind === 'straight' ? mm(tool.section.diameter / 2) : mm(0);
        const inward = offsetRingOutward(reversePolygon(ring), radius);
        inward.problems.forEach((p) => warnings.push(`"${panel.name}": ${p}`));
        operations.push({
          ...base,
          kind: 'contour',
          id: opId(panel.id, f.id),
          purpose: f.purpose,
          path: reversePolygon(inward.path),
          closed: true,
          depth: mm(thickness + setup.throughOvercut),
          toolId: setup.partCutterToolId,
        });
        break;
      }

      case 'rebate':
        // A step along an edge. Real, and not modelled as a toolpath yet — it wants a stepover
        // pass and nothing in the shipped specs emits one.
        warnings.push(`"${panel.name}": a rebate is not machined yet. Cut it on the saw.`);
        break;
    }
  }

  return { operations, unreachable };
};

/**
 * Every operation for one nested sheet, in the order it happens.
 */
export const sheetProgram = (
  material: MaterialNest,
  sheetIndex: number,
  panelsById: ReadonlyMap<string, Panel>,
  thickness: Mm,
  setup: CamSetup,
): SheetProgram => {
  const sheet = material.sheets.find((s) => s.index === sheetIndex)!;
  const operations: Operation[] = [];
  const needsSecondSetup: string[] = [];
  const warnings: string[] = [];

  const cutter = findToolOrNull(setup.partCutterToolId);
  if (!cutter || cutter.section.kind !== 'straight') {
    warnings.push(
      `The part cutter "${setup.partCutterToolId}" is not a straight-sided bit, so parts cannot ` +
        `be cut out with it.`,
    );
  }
  const cutterRadius =
    cutter && cutter.section.kind === 'straight' ? mm(cutter.section.diameter / 2) : mm(0);

  for (const placement of sheet.placements) {
    const panel = panelsById.get(placement.partId);
    if (!panel) continue;
    const { length, width } = panelExtent(panel);

    const faces = new Set(
      panel.features.map(featureFace).filter((f): f is MachiningFace => f !== null),
    );
    const faceUp = faceToLayUp(faces, weightOfFace(panel.features, 'A'), weightOfFace(panel.features, 'B'));
    const lay: Lay = { at: placement.at, orientation: placement.orientation, length, width, faceUp };

    const { operations: featureOps, unreachable } = featureOperations(
      panel,
      lay,
      setup,
      thickness,
      warnings,
    );
    operations.push(...featureOps);
    if (unreachable > 0) needsSecondSetup.push(panel.name);

    // The part's own outline, offset outward by the cutter's radius and cut through.
    const outline = partRingToSheet(panel.profile.outline, lay);
    const offset = offsetRingOutward(outline, cutterRadius);
    offset.problems.forEach((p) => warnings.push(`"${panel.name}": ${p}`));
    operations.push({
      partId: panel.id,
      partName: panel.name,
      kind: 'contour',
      id: opId(panel.id, 'perimeter'),
      purpose: 'perimeter',
      path: offset.path,
      closed: true,
      depth: perimeterDepth(thickness, setup),
      toolId: setup.partCutterToolId,
      leaveUncut: setup.leaveUncut,
    });
  }

  return {
    materialId: material.materialId,
    materialLabel: material.label,
    sheetIndex,
    sheetLength: material.sheet.length,
    sheetWidth: material.sheet.width,
    thickness,
    operations: orderOperations(operations),
    needsSecondSetup,
    warnings,
  };
};

/** Every sheet in a job, as programs. */
export const projectPrograms = (
  project: Project,
  setup: CamSetup,
  nest: ProjectNest = nestProject(project),
): SheetProgram[] => {
  const panelsById = new Map<string, Panel>();
  for (const built of buildProject(project)) {
    for (const panel of built.panels) panelsById.set(panel.id, panel);
  }
  for (const unit of buildRunUnits(project)) {
    for (const panel of unit.panels) panelsById.set(panel.id, panel);
  }

  return nest.byMaterial.flatMap((material) => {
    const thickness = actualThicknessOf(findSheet(project.materials, material.materialId));
    return material.sheets.map((sheet) =>
      sheetProgram(material, sheet.index, panelsById, thickness, setup),
    );
  });
};

/** Every distinct cutter a program calls for, so a post can write a tool table. */
export const toolsUsed = (program: SheetProgram): string[] => {
  const ids = new Set<string>();
  for (const op of program.operations) if (op.kind !== 'bore') ids.add(op.toolId);
  return [...ids].sort();
};

/** Every distinct bore diameter, which on a machine with a drill bank decides which spindles. */
export const boreDiametersUsed = (program: SheetProgram): Mm[] => {
  const sizes = new Set<number>();
  for (const op of program.operations) if (op.kind === 'bore') sizes.add(op.diameter);
  return [...sizes].sort((a, b) => a - b);
};

/** Points on a path, for bounds checks and drawing. Arcs contribute their endpoints only. */
export const operationPoints = (op: Operation): Vec2[] => {
  switch (op.kind) {
    case 'bore':
      return [op.at];
    case 'contour':
      return op.path.map((v) => ({ x: v.x, y: v.y }));
    case 'pocket':
      return op.outline.map((v) => ({ x: v.x, y: v.y }));
    case 'profiled':
      return [...op.path];
  }
};
