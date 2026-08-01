/**
 * Nesting a job — which sheets to buy, and what comes off each one.
 *
 * This is the layer that turns `Panel` records into a sheet order. It consumes exactly the panels
 * the cutlist and the costing consume, so a nested part, a quoted part and a cut part are the same
 * part by construction — the whole reason there is only one `Panel`.
 *
 * **A nest is of blanks, not of shapes, and that is correct rather than a shortcut.** A guillotine
 * cut runs edge to edge, so a radiused shelf does not come off the sheet as a curve; a rectangle
 * comes off the sheet and the curve is cut from the rectangle afterwards, on a router or a
 * bandsaw. The blank is therefore the thing the sheet has to hold, which is `panelExtent` — the
 * bounding box, measured round the outside of every arc. §5.1 read this as a gap waiting to be
 * filled by true-shape nesting; it is not one for a saw. It is one for a router, and a router nest
 * is a different piece of work with a different cutting model.
 *
 * What this replaces: the old estimate of area ÷ a yield allowance. That number had two problems
 * beyond being a guess. It charged **fractional sheets** — 3.23 sheets' worth of money on a job
 * whose own summary said four — and nobody sells a third of a sheet. And the allowance was a
 * single figure across every material and every part size, so a job of small parts and a job with
 * a 3000mm plinth rail in it were assumed to waste the same proportion. A nest answers both: whole
 * sheets, counted, with the yield it actually achieved reported rather than assumed.
 */

import { type Cents, type Mm, type Mm2, mm2ToM2 } from '../units.ts';
import {
  type GrainDirection,
  type MaterialLibrary,
  type SheetMaterial,
  type SheetSize,
  findSheet,
} from '../model/material.ts';
import { type GrainConstraint, type Panel, panelExtent } from '../model/panel.ts';
import type { Project } from '../model/project.ts';
import { buildProject } from '../rules/build.ts';
import { buildRunUnits } from '../rules/runUnits.ts';
import {
  type Cut,
  type Orientation,
  type PackStrategy,
  type PackablePart,
  type PackedSheet,
  type Rect,
  packBest,
  rectArea,
  usableArea,
} from './guillotine.ts';

export type { Cut, Orientation, PackStrategy, PackedSheet, Placement, Rect } from './guillotine.ts';

/**
 * Which ways round a part may be laid, given the board it is cut from.
 *
 * Two records answer half the question each, and neither can answer it alone. The **material**
 * says whether the board has a direction and which way it runs; the **part** says whether it cares.
 * A shelf out of white melamine may go either way; the same shelf out of Sepia Oak may not; a
 * drawer front whose length runs across the part still has to have its *grain* running the length
 * of the cabinet, which on a length-grained board means it is turned.
 *
 * That last case is why this is a lookup rather than a boolean. "May it rotate?" is the wrong
 * question — some parts are *required* to, and a nester that only knows how to decline rotation
 * lays them the wrong way round while passing every test that checks the part fits.
 */
export const orientationsFor = (
  part: GrainConstraint,
  board: GrainDirection,
): readonly Orientation[] => {
  if (board === 'none' || part === 'any') return ['as-cut', 'turned'];
  // The part's length runs along the board's grain when the two agree about which axis that is.
  const alongLength = (board === 'length') === (part === 'length-along-grain');
  return alongLength ? ['as-cut'] : ['turned'];
};

/** A part as the nest knows it — enough to draw it, name it and check it. */
export interface NestPart {
  readonly panelId: string;
  readonly name: string;
  /** The cabinet, benchtop or plinth it is cut for. */
  readonly ownerName: string;
  readonly materialId: string;
  readonly length: Mm;
  readonly width: Mm;
  readonly grain: GrainConstraint;
}

export interface NestedSheet extends PackedSheet {
  /** 1-based, within this material. */
  readonly index: number;
  /** Total blank area placed on this sheet. */
  readonly placedArea: Mm2;
  /** Placed area over the whole sheet — including anything trimmed off the edges. */
  readonly yield: number;
}

export interface MaterialNest {
  readonly materialId: string;
  readonly label: string;
  /** The sheet size chosen for this material. */
  readonly sheet: SheetSize;
  readonly sheets: readonly NestedSheet[];
  readonly parts: readonly NestPart[];
  /**
   * Which of the packer's strategies produced this nest.
   *
   * Reported rather than hidden, because it is the honest answer to "why is it laid out like
   * that?" — and because a nest that suddenly changes strategy between two versions of a job is
   * something somebody will want to see rather than have to work out.
   */
  readonly strategy: PackStrategy;
  /**
   * Parts too big for a sheet of this material, in every orientation the grain allows.
   *
   * Each is charged a sheet of its own — see `cost`. That figure is a floor rather than an
   * estimate: a part that fits no sheet cannot be cut as drawn, so there is no honest number, and
   * a zero would quietly take the part off the quote altogether.
   */
  readonly oversize: readonly NestPart[];
  /** Blank area of every part placed. */
  readonly placedArea: Mm2;
  /** What has to be bought: every sheet, whole, including the oversize allowance. */
  readonly sheetCount: number;
  readonly boughtArea: Mm2;
  /** Placed area over bought area. The figure `sheetWastageFactor` used to be a guess at. */
  readonly yield: number;
  readonly cost: Cents;
  readonly indicativePricing: boolean;
}

export interface ProjectNest {
  readonly byMaterial: readonly MaterialNest[];
  readonly sheetCount: number;
  /** Every sheet's cost, ex GST and before any GST treatment is applied. */
  readonly sheetCostExGst: Cents;
  readonly kerf: Mm;
  readonly edgeTrim: Mm;
  readonly warnings: readonly string[];
}

const materialLabel = (m: SheetMaterial): string => `${m.brand} ${m.decor} ${m.thickness}mm`;

/** Every panel a job cuts, with the name of the thing it is cut for. */
export const nestParts = (project: Project): NestPart[] => {
  const groups: { name: string; panels: readonly Panel[] }[] = [
    ...buildProject(project).map((b) => ({ name: b.cabinet.name, panels: b.panels })),
    ...buildRunUnits(project).map((u) => ({ name: u.name, panels: u.panels })),
  ];
  return groups.flatMap(({ name, panels }) =>
    panels.map((panel) => {
      const { length, width } = panelExtent(panel);
      return {
        panelId: panel.id,
        name: panel.name,
        ownerName: name,
        materialId: panel.materialId,
        length,
        width,
        grain: panel.grain,
      };
    }),
  );
};

interface SizeAttempt {
  readonly sheet: SheetSize;
  readonly packed: readonly PackedSheet[];
  readonly oversize: readonly NestPart[];
  readonly cost: Cents;
  readonly strategy: PackStrategy;
}

const trySize = (
  parts: readonly NestPart[],
  material: SheetMaterial,
  sheet: SheetSize,
  kerf: Mm,
  trim: Mm,
): SizeAttempt => {
  const packable: PackablePart[] = parts.map((p) => ({
    id: p.panelId,
    length: p.length,
    width: p.width,
    orientations: orientationsFor(p.grain, material.grain),
  }));
  const result = packBest(packable, { kerf, usable: usableArea(sheet.length, sheet.width, trim) });
  const oversize = result.unplaced.map((id) => parts.find((p) => p.panelId === id)!);
  return {
    sheet,
    packed: result.sheets,
    oversize,
    // The oversize allowance is counted here so a sheet size that cannot hold a part is not
    // preferred over one that can purely by being cheaper per sheet.
    cost: (result.sheets.length + oversize.length) * sheet.priceExGst,
    strategy: result.strategy,
  };
};

/**
 * Nest one material's parts, choosing the sheet size.
 *
 * **One size per material, chosen by what the job costs.** Every size the material comes in is
 * nested in full and the cheapest wins; a size that cannot hold every part loses to one that can,
 * however cheap it is per square metre. That is a real decision and not only an optimisation — a
 * sheet size is what goes on the supplier order, and a nest that mixed 3600×1800 and 2400×1200
 * across one material would be a nest whose first line is "work out which of these is which".
 *
 * A shop that genuinely wants to mix sizes on one material is describing a different order, and it
 * would want saying so per material rather than falling out of a search.
 */
export const nestMaterial = (
  parts: readonly NestPart[],
  material: SheetMaterial,
  kerf: Mm,
  trim: Mm,
): MaterialNest => {
  if (material.sheets.length === 0) {
    throw new Error(`nestMaterial: ${material.id} has no sheet sizes`);
  }

  const attempts = material.sheets.map((s) => trySize(parts, material, s, kerf, trim));
  // Fewest parts that don't fit first, then cheapest. A size that leaves nothing over always beats
  // one that does, so the comparison never trades an uncuttable part against a few dollars.
  const best = attempts.reduce((a, b) =>
    a.oversize.length !== b.oversize.length
      ? a.oversize.length < b.oversize.length
        ? a
        : b
      : a.cost <= b.cost
        ? a
        : b,
  );

  const sheetArea = best.sheet.length * best.sheet.width;
  const sheets: NestedSheet[] = best.packed.map((s, i) => {
    const placedArea = s.placements.reduce((sum, p) => sum + rectArea(p.at), 0);
    return { ...s, index: i + 1, placedArea, yield: placedArea / sheetArea };
  });

  const placedArea = sheets.reduce((sum, s) => sum + s.placedArea, 0);
  const sheetCount = sheets.length + best.oversize.length;
  const boughtArea = sheetCount * sheetArea;

  return {
    materialId: material.id,
    label: materialLabel(material),
    sheet: best.sheet,
    sheets,
    parts,
    strategy: best.strategy,
    oversize: best.oversize,
    placedArea,
    sheetCount,
    boughtArea,
    yield: boughtArea > 0 ? placedArea / boughtArea : 0,
    cost: sheetCount * best.sheet.priceExGst,
    indicativePricing: material.indicativePricing,
  };
};

/**
 * Nest a whole job.
 *
 * Grouped by material id, which already carries the thickness — two boards of the same decor at
 * 16 and 18 are two materials and are never nested together, which is what stops a nest that is
 * arithmetically fine and physically impossible.
 */
export const nestProject = (project: Project): ProjectNest => {
  const library: MaterialLibrary = project.materials;
  const { kerf, sheetEdgeTrim } = project.settings.nesting;

  const byId = new Map<string, NestPart[]>();
  for (const part of nestParts(project)) {
    const list = byId.get(part.materialId);
    if (list) list.push(part);
    else byId.set(part.materialId, [part]);
  }

  const warnings: string[] = [];
  const byMaterial = [...byId.entries()]
    .map(([materialId, parts]) => {
      const material = findSheet(library, materialId);
      const nest = nestMaterial(parts, material, kerf, sheetEdgeTrim);
      for (const part of nest.oversize) {
        warnings.push(
          `"${part.name}" is ${Math.round(part.length)}×${Math.round(part.width)}mm — too big ` +
            `for any ${nest.label} sheet, so it cannot be nested. It will need joining or a ` +
            `different material. A whole sheet is allowed for it on the quote as a floor, not ` +
            `as a real figure.`,
        );
      }
      return nest;
    })
    // Most sheets first — the order a sheet order gets written and checked in.
    .sort((a, b) => b.sheetCount - a.sheetCount || b.cost - a.cost);

  return {
    byMaterial,
    sheetCount: byMaterial.reduce((s, m) => s + m.sheetCount, 0),
    sheetCostExGst: byMaterial.reduce((s, m) => s + m.cost, 0),
    kerf,
    edgeTrim: sheetEdgeTrim,
    warnings,
  };
};

/** How much of a sheet's area is offcut worth keeping, by the shop's own smallest-useful figure. */
export const usableOffcuts = (sheet: PackedSheet, smallestUseful: Mm): readonly Rect[] =>
  sheet.offcuts.filter((o) => o.length >= smallestUseful && o.width >= smallestUseful);

/** Total sheet area of a nest, in m² — what the supplier order comes to. */
export const nestAreaM2 = (nest: ProjectNest): number =>
  mm2ToM2(nest.byMaterial.reduce((s, m) => s + m.boughtArea, 0));

/** The deepest cut on any sheet, for a shop whose saw is limited to two- or three-stage cutting. */
export const deepestStage = (nest: ProjectNest): number =>
  nest.byMaterial.reduce(
    (deepest, m) =>
      m.sheets.reduce(
        (d, s) => s.cuts.reduce((c, cut) => Math.max(c, cut.stage), d),
        deepest,
      ),
    0,
  );

/** Every cut on a material's sheets, flattened, for export. */
export const materialCuts = (nest: MaterialNest): { sheetIndex: number; cut: Cut }[] =>
  nest.sheets.flatMap((s) => s.cuts.map((cut) => ({ sheetIndex: s.index, cut })));
