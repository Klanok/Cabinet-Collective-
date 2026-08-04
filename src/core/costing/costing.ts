/**
 * Costing.
 *
 * Consumes exactly the `Panel` records the CAM layer will consume, so a quoted part and a cut
 * part are the same part by construction. There is no separate costing model to drift.
 *
 * **Sheet cost is whole sheets, counted off a real nest** (`nest/nest.ts`). It used to be part
 * area divided by an assumed yield, which was a guess and, worse, charged fractional sheets: the
 * sample kitchen was billed 3.23 sheets' worth of money on a screen that said four beside it.
 * Nobody sells a third of a sheet, so the job is now nested, the sheets are counted, and the
 * leftover is reported as offcut rather than deducted from the price of board that was bought.
 */

import { type Cents, type Mm2, mm2ToM2, mmToM, roundCents } from '../units.ts';
import {
  type MaterialLibrary,
  type SheetMaterial,
  actualThicknessOf,
  bestValueSheet,
  findEdgeBand,
  findSheet,
} from '../model/material.ts';
import { type Panel, bandedEdgeCount, bandedLength, panelArea, panelExtent, panelFootprint } from '../model/panel.ts';
import { DEFAULT_LABOUR_RATES, type GstMode, type Project } from '../model/project.ts';
import { buildProject } from '../rules/build.ts';

/** The decor laminate a curve is finished with. One id, so the order and the cost agree. */
export const LAMINATE_MATERIAL_ID = 'laminate-1mm';
import { machinedFronts } from '../rules/frontStyle.ts';
import { type HardwareBomLine, hardwareForCabinet } from '../hardware/bom.ts';
import { buildRunUnits } from '../rules/runUnits.ts';
import { type ProjectNest, nestProject } from '../nest/nest.ts';
import { benchtopChargeTotal, benchtopCharges, benchtopProblems } from './benchtopCost.ts';
import { cushionChargeTotal, cushionCharges, cushionProblems } from './cushionCost.ts';
import { effectiveCost, gstOnSale } from './gst.ts';

export interface PanelCost {
  readonly panelId: string;
  /** The cabinet, benchtop or ladder base the part was cut for. */
  readonly ownerId: string;
  readonly name: string;
  readonly materialId: string;
  readonly lengthMm: number;
  readonly widthMm: number;
  /** Bounding-box area — the blank the nest has to find room for. */
  readonly footprintM2: number;
  /**
   * This part's share of the board bought for its material.
   *
   * A **share**, not a price: board is bought by the sheet, and which part pushed the job onto its
   * fifth sheet is not a question with an answer. The shares are apportioned by blank area and sum
   * to the material's real cost exactly — the rounding remainder is carried from part to part
   * rather than dropped, so the column adds up to the total rather than to within a few cents of
   * it. The authoritative figure is always the material's, in `byMaterial`.
   */
  readonly sheetCost: Cents;
  readonly bandedLengthM: number;
  readonly edgeBandCost: Cents;
  readonly totalCost: Cents;
}

export interface MaterialSummary {
  readonly materialId: string;
  readonly label: string;
  readonly panelCount: number;
  /** Blank area of every part cut from this material. */
  readonly footprintM2: number;
  /** What is bought: whole sheets, counted off the nest. */
  readonly sheets: number;
  readonly sheetLabel: string;
  readonly boughtM2: number;
  /** Blank area over bought area — measured, not assumed. */
  readonly yield: number;
  readonly cost: Cents;
  readonly indicativePricing: boolean;
}

export interface CostBreakdown {
  readonly panels: readonly PanelCost[];
  readonly byMaterial: readonly MaterialSummary[];
  /**
   * The nest the sheet count came from.
   *
   * Carried on the breakdown rather than left for callers to compute, so the quote, the sheet
   * order, the nest drawing and the cut sequence are all reading one nest. Nesting the job twice
   * and comparing the numbers is the kind of thing that agrees until the day it doesn't.
   */
  readonly nest: ProjectNest;

  readonly sheetCost: Cents;
  readonly edgeBandCost: Cents;
  /**
   * Runners, hinges, plates and pins.
   *
   * Part of `materialCost`, because it is bought stock and it picks up unclaimable GST exactly as a
   * sheet does for an unregistered entity — but on its own line, because it is the biggest thing a
   * Phase 1 quote was missing. A kitchen with ten hinges and three drawer sets in it was being
   * quoted as though the hardware were free.
   */
  readonly hardwareCost: Cents;
  /**
   * Benchtops bought in rather than cut — stone, postformed laminate.
   *
   * Its own line, and **not** part of `sheetCost`, because it is not a sheet: it is a fabricator's
   * invoice, per square metre with the cutouts, the joins, the edge profiling and a minimum all
   * charged on top. A shop-made top is not here — that one is a cut part and is in `sheetCost` with
   * everything else, which is the whole point of `supply` being a property of the top.
   */
  readonly benchtopCost: Cents;
  /**
   * Banquette cushions, bought in as finished units from an upholsterer.
   *
   * Its own line for the same reason `benchtopCost` has one: it is somebody else's invoice rather
   * than stock this shop cuts, charged on their own basis — per lineal metre of each cushion. The
   * shop supplies templates or a substrate and takes delivery of the cushions, so **nothing here is
   * a part** and none of it appears on the cutlist or in the nest.
   *
   * It was missing entirely until §4.19, which meant a banquette's seat and back were quoted at
   * nothing. On a 3m run with a back that is over two thousand dollars of upholstery the quote did
   * not mention.
   */
  readonly cushionCost: Cents;
  readonly materialCost: Cents;

  readonly labourMinutes: number;
  readonly labourCost: Cents;

  /**
   * Router time the door styles add, over and above the panel and assembly allowances.
   *
   * Its own line rather than folded into `labourMinutes`, because it is machine time in the
   * shop — it must not flow into the install estimate that mirrors the shop hours. Quoting a
   * shaker kitchen as if the doors were plain slabs is the error this exists to stop.
   */
  readonly machiningMinutes: number;
  readonly machiningCost: Cents;
  /**
   * Laminating the curves — the sheet, and the hand work to put it on.
   *
   * Its own lines rather than folded into `sheetCost` and `labourCost`, for two reasons. The
   * laminate is **not nested**: it is cut oversize by hand and trimmed, so it has no place in a
   * cut plan and its sheets are counted off area instead. And the labour is shop time that must
   * not flow into the install estimate that mirrors the shop hours — laminating a curve in the
   * factory does not make it slower to hang on site.
   */
  readonly laminatedM2: number;
  readonly laminatedCurves: number;
  readonly laminateSheets: number;
  /** Which size those sheets are — what goes on the order. */
  readonly laminateSheetLabel: string;
  readonly laminateCost: Cents;
  readonly laminateMinutes: number;
  readonly laminateLabourCost: Cents;
  /** How many fronts actually came out routed. Fronts that fell back to a slab don't count. */
  readonly machinedFrontCount: number;

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

/**
 * One part, priced for everything except the board it is cut from.
 *
 * The board is deliberately missing here, and it is the whole shape of this phase: a part does
 * not have a sheet cost of its own. Sheets are bought whole for a *material*, so the cost is
 * resolved once the nest is known and shared back out in `apportionSheetCost`.
 */
const costPanel = (
  panel: Panel,
  library: MaterialLibrary,
  mode: GstMode,
  warnings: string[],
): Omit<PanelCost, 'sheetCost' | 'totalCost'> & { footprint: Mm2 } => {
  const material = findSheet(library, panel.materialId);
  const { length, width } = panelExtent(panel);

  const footprint: Mm2 = panelFootprint(panel);
  const footprintM2 = mm2ToM2(footprint);

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
    ownerId: panel.ownerId,
    name: panel.name,
    materialId: panel.materialId,
    lengthMm: length,
    widthMm: width,
    footprint,
    footprintM2,
    bandedLengthM: bandM,
    edgeBandCost,
  };
};

/**
 * Share a material's real sheet cost out across the parts cut from it, by blank area.
 *
 * The remainder is **carried**, not rounded away: each part's figure is the difference between two
 * running totals, so the column sums to the material's cost exactly. Rounding each share on its own
 * would leave the parts table a few cents off the quote, which is the sort of small disagreement
 * that costs an afternoon to explain and cannot be defended when somebody finds it.
 *
 * A material whose parts all have zero area — nothing does, but the arithmetic has to survive it —
 * shares the cost out evenly rather than dividing by nothing.
 */
const apportionSheetCost = (
  parts: readonly { footprint: Mm2 }[],
  total: Cents,
): number[] => {
  const areaTotal = parts.reduce((s, p) => s + p.footprint, 0);
  let carried = 0;
  let given = 0;
  return parts.map((p, i) => {
    carried += areaTotal > 0 ? p.footprint / areaTotal : 1 / parts.length;
    const upTo = i === parts.length - 1 ? total : roundCents(carried * total);
    const share = upTo - given;
    given = upTo;
    return share;
  });
};

export const costProject = (project: Project): CostBreakdown => {
  const built = buildProject(project);
  const units = buildRunUnits(project);
  // Shop-made tops and ladder bases are cut parts, so they go through the same sheet-and-banding
  // arithmetic as everything else. Bought-in tops produce none, and are charged separately below.
  const panels = [...built.flatMap((b) => b.panels), ...units.flatMap((u) => u.panels)];
  const warnings: string[] = [
    ...built.flatMap((b) => b.warnings),
    ...units.flatMap((u) => u.warnings),
    ...benchtopProblems(project),
    // A cushion nobody can price is drawn on screen and quoted at nothing, which is the fault
    // §5.11 reported rather than a caveat about it.
    ...cushionProblems(project),
  ];

  const { settings, materials: library } = project;
  const mode = settings.gstMode;

  /*
   * **A labour rate that is missing is a sentence, never silence.**
   *
   * This is §4.19's rule about the cushion rate, applied to the figure that has now taken the whole
   * quote down twice. A rate that is `undefined` does not read as zero — it reads as `NaN`, because
   * `0 * undefined` is `NaN`, and one `NaN` anywhere in the sum takes `totalCost` and everything
   * derived from it. So the job quotes at `$NaN` from Total cost downward while every line above it
   * shows real money, which is the most confusing shape a broken quote can have.
   *
   * The migrations either side of this (project v29, standards v21) are what stop a rate going
   * missing in the first place. This names it if one ever does again, because the alternative —
   * found twice now — is arithmetic that fails silently in a number somebody is about to quote from.
   * Substituting a default here instead would be the failure `cushionProblems` exists to prevent:
   * a plausible figure nobody chose, on a quote that looks finished.
   */
  /*
   * Driven off the **shipped record's** keys rather than the job's own, and that is the whole
   * point: the fault being caught is a key that is *absent*, and iterating what is there cannot
   * see what is not. `typeof undefined` is `'undefined'`, so a check written over the job's own
   * entries would have passed cleanly on the very job that reported this.
   */
  for (const [key, shipped] of Object.entries(DEFAULT_LABOUR_RATES)) {
    if (typeof shipped !== 'number') continue;
    const value = (settings.labour as unknown as Record<string, unknown>)[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      warnings.push(
        `The labour rate "${key}" is missing from this job, so every figure computed from it ` +
          `comes out as NaN and the total cannot be trusted. Open Settings → Costing and set it.`,
      );
    }
  }

  /*
   * The nest, and it is the only thing that decides how much board this job buys.
   *
   * It is run here rather than looked up, and carried on the breakdown afterwards, so the quote
   * and the sheet order are one nest rather than two that agree until they don't. Its warnings —
   * a part too big for any sheet — come with it, which is why costing no longer asks that question
   * itself; two places testing whether a part fits is two places that can answer differently.
   */
  const nest = nestProject(project);
  warnings.push(...nest.warnings);

  const priced = panels.map((p) => costPanel(p, library, mode, warnings));

  /*
   * Board cost, per material, whole sheets. `effectiveCost` is applied to the material's total
   * rather than to each share, because it is the sheet that is bought and the GST that is or isn't
   * claimable is the GST on the sheet.
   */
  const sheetCostByMaterial = new Map<string, Cents>();
  for (const m of nest.byMaterial) sheetCostByMaterial.set(m.materialId, effectiveCost(m.cost, mode));

  const shareByPanel = new Map<string, Cents>();
  for (const [materialId, total] of sheetCostByMaterial) {
    const parts = priced.filter((p) => p.materialId === materialId);
    const shares = apportionSheetCost(parts, total);
    parts.forEach((p, i) => shareByPanel.set(p.panelId, shares[i]!));
  }

  const panelCosts: PanelCost[] = priced.map((p) => {
    const { footprint: _blank, ...rest } = p;
    const sheetCost = shareByPanel.get(p.panelId) ?? 0;
    return { ...rest, sheetCost, totalCost: sheetCost + p.edgeBandCost };
  });

  const sheetCost = [...sheetCostByMaterial.values()].reduce((s, c) => s + c, 0);
  const edgeBandCost = panelCosts.reduce((s, p) => s + p.edgeBandCost, 0);

  /*
   * Hardware, counted from the panels each cabinet really produced — see `hardwareForCabinet`.
   * Costed per cabinet rather than off the grouped BOM so the whole breakdown comes out of one pass
   * over `built`, which is what stops the quote and the order form disagreeing about how many
   * hinges there are.
   */
  const hardwareLines: HardwareBomLine[] = [];
  let hardwareExGst = 0;
  for (const b of built) {
    for (const line of hardwareForCabinet(b, project)) {
      hardwareExGst += line.quantity * line.unitPriceExGst;
      hardwareLines.push({
        ...line,
        cabinetNames: [b.cabinet.name],
        totalExGst: roundCents(line.quantity * line.unitPriceExGst),
      });
    }
  }
  /*
   * Rounded **once**, at the end, for the reason `effectiveCost` states: rounding per line and then
   * applying GST rounds twice. Unlike a sheet, a hinge is not a separately priced item on the quote
   * — it is part of one hardware figure — so there is nothing to round in between, and doing it
   * anyway leaves the costed hardware a cent off the BOM total for no reason anybody could explain.
   */
  const hardwareCost: Cents = effectiveCost(hardwareExGst, mode);

  /*
   * Bought-in benchtops. Not sheet goods and not hardware — a service somebody else invoices, on
   * their own rates, with their own minimum. Its own line for the same reason hardware got one: it
   * is large enough that folding it into another number hides it.
   */
  const charges = benchtopCharges(project);
  const benchtopCost: Cents = benchtopChargeTotal(charges);

  /*
   * Bought-in cushions, on exactly the same footing as a bought-in top: an upholsterer's invoice,
   * on their own basis, for something this shop does not make. See `costing/cushionCost.ts`.
   */
  const cushionCost: Cents = cushionChargeTotal(cushionCharges(project));

  const materialCost = sheetCost + edgeBandCost + hardwareCost + benchtopCost + cushionCost;

  const bandedEdges = panels.reduce((s, p) => s + bandedEdgeCount(p), 0);
  /*
   * Assembly time is per **thing that got assembled**, which is not the same as per row in the
   * cabinet list. An appliance space produces no parts and takes no assembly; so does a cabinet
   * whose dimensions don't work. A ladder base very much does take assembly, and it is not in the
   * cabinet list at all. Counting produced parts rather than list length gets all three right.
   */
  const assemblies =
    // A standalone panel is cut and edged, but there is no carcass to assemble. Its panel and
    // edge labour are already counted in the two terms below.
    built.filter((b) => b.panels.length > 0 && b.cabinet.typeId !== 'panel').length +
    units.filter((u) => u.panels.length > 0).length;
  const labourMinutes =
    panels.length * settings.labour.minutesPerPanel +
    bandedEdges * settings.labour.minutesPerBandedEdge +
    assemblies * settings.labour.minutesPerCabinet;
  // Labour is charged out at an ex-GST rate under both registration contexts — there is no
  // input credit to claim on your own time.
  const labourCost = roundCents((labourMinutes / 60) * settings.labour.ratePerHourExGst * 100);

  // Routing the fronts, at the shop rate. The minutes belong to the style — a shaker recess
  // and a run of V-grooves are not the same job — and the count comes from the panels that
  // really carry machining, so a drawer front too narrow to take the style costs nothing extra.
  let machiningMinutes = 0;
  let machinedFrontCount = 0;
  for (const b of built) {
    const routed = machinedFronts(b.panels);
    machinedFrontCount += routed.length;
    machiningMinutes += routed.length * b.doorStyle.machiningMinutesPerFront;
  }
  const machiningCost = roundCents(
    (machiningMinutes / 60) * settings.labour.ratePerHourExGst * 100,
  );

  /*
   * Laminating the curves.
   *
   * **The area is the outermost skin's own blank**, and that is the right measure rather than a
   * convenient one: the laminate is cut *oversize* and trim-routed after it is stuck, so what
   * gets consumed is at least the developed face it covers. Taking the longest skin per cabinet
   * finds the outer layer without having to know how many there are — each layer wraps the one
   * under it and is therefore longer.
   *
   * Sheets are counted off area and **rounded up to whole ones**, for the reason §4.8 gives
   * about board: nobody sells a third of a sheet. It is not a nest and does not pretend to be —
   * a hand-applied, hand-trimmed sheet has no cut plan. Polytec do sell part sheets in certain
   * sizes, which would come off this figure; that is not modelled and is worth saying rather
   * than quietly assuming the shop always buys full ones.
   */
  let laminatedMm2 = 0;
  let laminatedCurves = 0;
  for (const b of built) {
    const skins = b.panels.filter((p) => p.role === 'skin');
    if (skins.length === 0) continue;
    const outer = skins.reduce((a, p) => (panelArea(p) > panelArea(a) ? p : a));
    laminatedMm2 += panelArea(outer);
    laminatedCurves += 1;
  }
  const laminatedM2 = mm2ToM2(laminatedMm2 as Mm2);
  /*
   * A job whose price list has no laminate on it still gets its curves *reported*, not silently
   * priced at nothing. Reaching for `findSheet` here would throw and take the whole quote with
   * it, which is worse than a curve costed short and said so.
   */
  const laminateMaterial =
    project.materials.sheets.find((m) => m.id === LAMINATE_MATERIAL_ID) ?? null;

  /*
   * **The cheapest way to buy the area, not the cheapest rate per square metre.**
   *
   * The same comparison §4.8 makes for board, and it matters more here because a laminated curve
   * is small. One 720-tall curve takes about half a square metre; charged against the best-value
   * 3660 × 1830 that is a whole $400 sheet for 8% of it. The shop's own note is that full sheets
   * are the norm *but part sheets can be bought in certain sizes*, and picking the smallest size
   * that does the job is how that shows up in a quote without modelling a cut-to-size service.
   *
   * Still whole sheets of whatever size wins — nobody sells a third of one — and still not a
   * nest: a hand-applied, hand-trimmed sheet has no cut plan.
   */
  const laminateBuy =
    laminatedCurves > 0 && laminateMaterial !== null && laminateMaterial.sheets.length > 0
      ? laminateMaterial.sheets
          .map((size) => {
            const count = Math.ceil(laminatedM2 / mm2ToM2((size.length * size.width) as Mm2));
            return { size, count, cost: count * size.priceExGst };
          })
          .reduce((a, b) => (b.cost < a.cost ? b : a))
      : null;
  const laminateSheets = laminateBuy?.count ?? 0;
  const laminateCost = laminateBuy === null ? 0 : roundCents(laminateBuy.cost);
  if (laminatedCurves > 0 && laminateMaterial === null) {
    warnings.push(
      `This job has ${laminatedCurves} laminated curve${laminatedCurves === 1 ? '' : 's'} in it ` +
        `but no finish laminate on its price list, so the sheet is not costed. Add ` +
        `"${LAMINATE_MATERIAL_ID}" under Settings → Materials. The labour is still charged.`,
    );
  }
  // Two components, because the tack-off is a wait and a wait does not scale with the curve.
  const laminateMinutes =
    laminatedCurves * settings.labour.laminateSetupMinutesPerCurve +
    laminatedM2 * settings.labour.laminateMinutesPerM2;
  const laminateLabourCost = roundCents(
    (laminateMinutes / 60) * settings.labour.ratePerHourExGst * 100,
  );

  // Install is its own subtotal. Until there is a real per-cabinet install model, its hours
  // mirror the shop hours — rough, but visible and easy to override per job. Router time is
  // left out of that mirror: routing a door takes no longer to hang.
  const installHours =
    settings.labour.installHoursMode === 'fixed'
      ? settings.labour.installFixedHours
      : labourMinutes / 60;
  const installCost = roundCents(installHours * settings.labour.installRatePerHourExGst * 100);

  /*
   * The laminate lands on both halves of the job and neither can be left out.
   *
   * `laminateCost` is board that gets bought, so it belongs with the materials; `laminateLabourCost`
   * is shop time, so it sits beside the routing rather than inside `labourCost` — which is the same
   * separation `machiningCost` already has, and for the same reason: the install estimate mirrors
   * the shop hours, and laminating a curve in the factory does not make it slower to hang.
   */
  const totalCost =
    materialCost +
    laminateCost +
    labourCost +
    machiningCost +
    laminateLabourCost +
    installCost;
  const marginAmount = roundCents(totalCost * (settings.marginPercent / 100));
  const subtotalExGst = totalCost + marginAmount;
  // Delivery is a flat charge passed on, not a cost being sold on, so it sits outside margin.
  const deliveryFee = roundCents(settings.deliveryFeeExGst * 100);
  const sellExGst = subtotalExGst + deliveryFee;
  const gst = gstOnSale(sellExGst, mode);

  const byMaterial: MaterialSummary[] = nest.byMaterial
    .map((m) => ({
      materialId: m.materialId,
      label: m.label,
      panelCount: m.parts.length,
      footprintM2: mm2ToM2(m.placedArea),
      sheets: m.sheetCount,
      sheetLabel: `${m.sheet.length}×${m.sheet.width}`,
      boughtM2: mm2ToM2(m.boughtArea),
      yield: m.yield,
      cost: sheetCostByMaterial.get(m.materialId) ?? 0,
      indicativePricing: m.indicativePricing,
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    panels: panelCosts,
    byMaterial,
    nest,
    sheetCost,
    edgeBandCost,
    hardwareCost,
    benchtopCost,
    cushionCost,
    materialCost,
    labourMinutes,
    labourCost,
    machiningMinutes,
    machiningCost,
    laminatedM2,
    laminatedCurves,
    laminateSheets,
    laminateSheetLabel: laminateBuy ? `${laminateBuy.size.length}×${laminateBuy.size.width}` : '',
    laminateCost,
    laminateMinutes,
    laminateLabourCost,
    machinedFrontCount,
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
    usesIndicativePricing:
      byMaterial.some((m) => m.indicativePricing) ||
      hardwareLines.some((l) => l.indicativePricing) ||
      charges.some((c) => c.indicativePricing),
    warnings,
  };
};
