/**
 * Costing.
 *
 * Consumes exactly the `Panel` records the CAM layer will consume, so a quoted part and a cut
 * part are the same part by construction. There is no separate costing model to drift.
 *
 * Sheet cost is estimated from part area plus a yield allowance, because until Phase 3 nests
 * the job there is no honest sheet count. That estimate is labelled as such everywhere it
 * surfaces — a nested job will give a different, and higher-confidence, number.
 */

import { type Cents, type Mm2, mm2ToM2, mmToM, roundCents } from '../units.ts';
import {
  type MaterialLibrary,
  type SheetMaterial,
  actualThicknessOf,
  bestValueSheet,
  findEdgeBand,
  findSheet,
  smallestSheetFitting,
} from '../model/material.ts';
import { type Panel, bandedEdgeCount, bandedLength, panelExtent, panelFootprint } from '../model/panel.ts';
import type { GstMode, Project } from '../model/project.ts';
import { buildProject } from '../rules/build.ts';
import { effectiveCost, gstOnSale } from './gst.ts';

export interface PanelCost {
  readonly panelId: string;
  readonly cabinetId: string;
  readonly name: string;
  readonly materialId: string;
  readonly lengthMm: number;
  readonly widthMm: number;
  /** Bounding-box area — the sheet real estate the part consumes. */
  readonly footprintM2: number;
  readonly sheetCost: Cents;
  readonly bandedLengthM: number;
  readonly edgeBandCost: Cents;
  readonly totalCost: Cents;
}

export interface MaterialSummary {
  readonly materialId: string;
  readonly label: string;
  readonly panelCount: number;
  readonly footprintM2: number;
  /** Area including the yield allowance — what actually has to be bought. */
  readonly purchasedM2: number;
  /** Estimated sheets. Replaced by a real count once Phase 3 nesting exists. */
  readonly estimatedSheets: number;
  readonly cost: Cents;
  readonly indicativePricing: boolean;
}

export interface CostBreakdown {
  readonly panels: readonly PanelCost[];
  readonly byMaterial: readonly MaterialSummary[];

  readonly sheetCost: Cents;
  readonly edgeBandCost: Cents;
  readonly materialCost: Cents;

  readonly labourMinutes: number;
  readonly labourCost: Cents;

  readonly installHours: number;
  readonly installCost: Cents;

  readonly totalCost: Cents;
  readonly marginAmount: Cents;
  /** Cost plus margin, before the flat charges that aren't marked up. */
  readonly subtotalExGst: Cents;
  readonly deliveryFee: Cents;
  readonly sellExGst: Cents;
  readonly gst: Cents;
  readonly totalIncGst: Cents;

  readonly gstMode: GstMode;
  readonly panelCount: number;
  readonly cabinetCount: number;
  /** True when any priced material is still on placeholder rates. */
  readonly usesIndicativePricing: boolean;
  readonly warnings: readonly string[];
}

/** Ex-GST cost per square metre of a sheet material, at its best-value sheet size. */
export const sheetRatePerM2 = (material: SheetMaterial): number => {
  const best = bestValueSheet(material);
  return best.priceExGst / mm2ToM2(best.length * best.width);
};

const materialLabel = (m: SheetMaterial): string =>
  `${m.brand} ${m.decor} ${m.thickness}mm`;

/**
 * Yield-adjusted area. `sheetWastageFactor` of 0.15 means 15% of a sheet is unusable, so the
 * area that has to be purchased is the part area divided by the usable 85%.
 */
const withYield = (area: number, wastageFactor: number): number => {
  const usable = 1 - wastageFactor;
  if (usable <= 0) throw new Error(`sheetWastageFactor ${wastageFactor} leaves no usable sheet`);
  return area / usable;
};

const costPanel = (
  panel: Panel,
  library: MaterialLibrary,
  wastageFactor: number,
  mode: GstMode,
  warnings: string[],
): PanelCost => {
  const material = findSheet(library, panel.materialId);
  const { length, width } = panelExtent(panel);

  if (!smallestSheetFitting(material, length, width)) {
    warnings.push(
      `"${panel.name}" is ${Math.round(length)}×${Math.round(width)}mm — too big for any ` +
        `${materialLabel(material)} sheet. It will need joining or a different material.`,
    );
  }

  const footprint: Mm2 = panelFootprint(panel);
  const footprintM2 = mm2ToM2(footprint);
  const purchasedM2 = withYield(footprintM2, wastageFactor);
  const sheetCost = effectiveCost(purchasedM2 * sheetRatePerM2(material), mode);

  const bandM = mmToM(bandedLength(panel));
  let edgeBandCost: Cents = 0;
  const bandIds = new Set(Object.values(panel.edgeBanding));
  if (bandIds.size > 0) {
    // All edges of one panel use the same band in Phase 1, so the first id governs the rate.
    const band = findEdgeBand(library, [...bandIds][0]!);
    // Measured against what the board really is, not what it is called — a 22mm band over a
    // nominal 16mm board that runs 16.3 still covers it, but the sums have to be done on the
    // edge that exists.
    const edge = actualThicknessOf(material);
    if (band.width < edge) {
      warnings.push(
        `Edge band "${band.decor}" is ${band.width}mm wide but "${panel.name}" is ` +
          `${edge}mm thick — the band will not cover the edge.`,
      );
    }
    edgeBandCost = effectiveCost(bandM * band.pricePerMetreExGst, mode);
  }

  return {
    panelId: panel.id,
    cabinetId: panel.cabinetId,
    name: panel.name,
    materialId: panel.materialId,
    lengthMm: length,
    widthMm: width,
    footprintM2,
    sheetCost,
    bandedLengthM: bandM,
    edgeBandCost,
    totalCost: sheetCost + edgeBandCost,
  };
};

const summariseMaterials = (
  panelCosts: readonly PanelCost[],
  library: MaterialLibrary,
  wastageFactor: number,
): MaterialSummary[] => {
  const byId = new Map<string, { count: number; footprintM2: number; cost: Cents }>();
  panelCosts.forEach((pc) => {
    const entry = byId.get(pc.materialId) ?? { count: 0, footprintM2: 0, cost: 0 };
    entry.count += 1;
    entry.footprintM2 += pc.footprintM2;
    entry.cost += pc.sheetCost;
    byId.set(pc.materialId, entry);
  });

  return [...byId.entries()].map(([materialId, entry]) => {
    const material = findSheet(library, materialId);
    const best = bestValueSheet(material);
    const purchasedM2 = withYield(entry.footprintM2, wastageFactor);
    return {
      materialId,
      label: materialLabel(material),
      panelCount: entry.count,
      footprintM2: entry.footprintM2,
      purchasedM2,
      estimatedSheets: Math.ceil(purchasedM2 / mm2ToM2(best.length * best.width)),
      cost: entry.cost,
      indicativePricing: material.indicativePricing,
    };
  }).sort((a, b) => b.cost - a.cost);
};

export const costProject = (project: Project): CostBreakdown => {
  const built = buildProject(project);
  const panels = built.flatMap((b) => b.panels);
  const warnings: string[] = built.flatMap((b) => b.warnings);

  const { settings, materials: library } = project;
  const mode = settings.gstMode;
  const wastage = settings.sheetWastageFactor;

  const panelCosts = panels.map((p) => costPanel(p, library, wastage, mode, warnings));

  const sheetCost = panelCosts.reduce((s, p) => s + p.sheetCost, 0);
  const edgeBandCost = panelCosts.reduce((s, p) => s + p.edgeBandCost, 0);
  const materialCost = sheetCost + edgeBandCost;

  const bandedEdges = panels.reduce((s, p) => s + bandedEdgeCount(p), 0);
  const labourMinutes =
    panels.length * settings.labour.minutesPerPanel +
    bandedEdges * settings.labour.minutesPerBandedEdge +
    project.cabinets.length * settings.labour.minutesPerCabinet;
  // Labour is charged out at an ex-GST rate under both registration contexts — there is no
  // input credit to claim on your own time.
  const labourCost = roundCents((labourMinutes / 60) * settings.labour.ratePerHourExGst * 100);

  // Install is its own subtotal. Until there is a real per-cabinet install model, its hours
  // mirror the shop hours — rough, but visible and easy to override per job.
  const installHours =
    settings.labour.installHoursMode === 'fixed'
      ? settings.labour.installFixedHours
      : labourMinutes / 60;
  const installCost = roundCents(installHours * settings.labour.installRatePerHourExGst * 100);

  const totalCost = materialCost + labourCost + installCost;
  const marginAmount = roundCents(totalCost * (settings.marginPercent / 100));
  const subtotalExGst = totalCost + marginAmount;
  // Delivery is a flat charge passed on, not a cost being sold on, so it sits outside margin.
  const deliveryFee = roundCents(settings.deliveryFeeExGst * 100);
  const sellExGst = subtotalExGst + deliveryFee;
  const gst = gstOnSale(sellExGst, mode);

  const byMaterial = summariseMaterials(panelCosts, library, wastage);

  return {
    panels: panelCosts,
    byMaterial,
    sheetCost,
    edgeBandCost,
    materialCost,
    labourMinutes,
    labourCost,
    installHours,
    installCost,
    totalCost,
    marginAmount,
    subtotalExGst,
    deliveryFee,
    sellExGst,
    gst,
    totalIncGst: sellExGst + gst,
    gstMode: mode,
    panelCount: panels.length,
    cabinetCount: project.cabinets.length,
    usesIndicativePricing: byMaterial.some((m) => m.indicativePricing),
    warnings,
  };
};
