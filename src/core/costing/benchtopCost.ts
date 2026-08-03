/**
 * What a bought-in benchtop costs.
 *
 * A shop-made top is not here, and that is the whole design: it is a cut part, so it is priced by
 * the same sheet-and-banding arithmetic every other part is, out of `costing.ts`. Only the
 * bought-in ones need this, because they are not parts at all — they are a purchase order.
 *
 * ## Why it is not area × rate
 *
 * Because a stone quote is not. Area is the biggest line but it is one of five, and the four others
 * are the ones that make a small job cost what it does:
 *
 *   - the **cutouts**, charged per hole and by what the hole is for
 *   - the **joins**, charged per join
 *   - the **edge profiling**, charged by the metre of finished edge
 *   - the **minimum**, which is what you actually pay on anything small
 *
 * A 900mm vanity top costed at area × rate comes out at about a third of the real number, and a
 * kitchen with a sink and two joins in it comes out several hundred short. Both are the kind of
 * error that is invisible until the invoice arrives.
 */

import { type Cents, mm2ToM2, mmToM, roundCents } from '../units.ts';
import {
  type Benchtop,
  benchtopDepth,
  benchtopLength,
  benchtopPlanArea,
  benchtopSections,
  finishedEdgeLength,
} from '../model/benchtop.ts';
import { type BenchtopMaterial, findBenchtopMaterial } from '../model/material.ts';
import type { GstMode, Project } from '../model/project.ts';
import { effectiveCost } from './gst.ts';

export interface BenchtopCharge {
  readonly benchtopId: string;
  readonly name: string;
  readonly materialLabel: string;
  readonly areaM2: number;
  readonly areaCost: Cents;
  readonly cutoutCount: number;
  readonly cutoutCost: Cents;
  readonly joinCount: number;
  readonly joinCost: Cents;
  readonly edgeMetres: number;
  readonly edgeCost: Cents;
  readonly edgeProfileName: string;
  /** True when the sum came to less than the fabricator's minimum, so the minimum is the price. */
  readonly minimumApplied: boolean;
  readonly totalExGst: Cents;
  readonly indicativePricing: boolean;
}

/**
 * Area to be paid for.
 *
 * The whole top including its overhangs, plus any waterfall end — a waterfall is a second slab the
 * height of the cabinets, and it is charged as one. Cutouts are **not** deducted, and that is not
 * an oversight: a fabricator charges the slab that goes out of the door, and the hole where the
 * sink goes was still cut, still handled and still paid for.
 */
const chargeableAreaM2 = (top: Benchtop): number => {
  const depth = benchtopDepth(top);
  const length = benchtopLength(top);
  // The slab less its rounded corners. A waterfall and an upstand are still rectangles — a curve
  // at the top of a waterfall panel is the join §4.7 leaves unmodelled, not a shape to charge for.
  let area = benchtopPlanArea(top);
  // Floor to the top surface — the same face the panel is cut to on a shop-made one.
  const waterfallDrop = -top.placement.anchor.y;
  if (top.ends.left === 'waterfall') area += waterfallDrop * depth;
  if (top.ends.right === 'waterfall') area += waterfallDrop * depth;
  // An upstand is another strip off the slab, and it is charged like one.
  if (top.upstand) area += length * top.upstand.height;
  return mm2ToM2(area);
};

/**
 * How many joins are charged.
 *
 * Every join the top is cut at, plus a mitred end — a mitre *is* a join, made between this top and
 * the one round the corner, and the fabricator charges it as one. It is deliberately not counted as
 * edge profiling as well; the joint is dressed, not profiled.
 */
const chargeableJoins = (top: Benchtop): number => {
  const cuts = benchtopSections(top).length - 1;
  const mitres = (top.ends.left === 'mitred' ? 1 : 0) + (top.ends.right === 'mitred' ? 1 : 0);
  return cuts + mitres;
};

const chargeFor = (top: Benchtop, material: BenchtopMaterial, mode: GstMode): BenchtopCharge => {
  const charges = material.charges;
  const label = `${material.brand} ${material.decor}`;
  if (!charges) {
    // A bought-in material with no rates on it. Reported as zero rather than guessed, and the
    // caller warns — see `benchtopProblems`.
    return {
      benchtopId: top.id,
      name: top.name,
      materialLabel: label,
      areaM2: chargeableAreaM2(top),
      areaCost: 0,
      cutoutCount: top.cutouts.length,
      cutoutCost: 0,
      joinCount: chargeableJoins(top),
      joinCost: 0,
      edgeMetres: mmToM(finishedEdgeLength(top)),
      edgeCost: 0,
      edgeProfileName: '',
      minimumApplied: false,
      totalExGst: 0,
      indicativePricing: material.indicativePricing,
    };
  }

  const areaM2 = chargeableAreaM2(top);
  const areaRaw = areaM2 * charges.ratePerM2ExGst;

  let cutoutRaw = 0;
  for (const cutout of top.cutouts) cutoutRaw += charges.cutoutChargeExGst[cutout.kind];

  const joinCount = chargeableJoins(top);
  const joinRaw = joinCount * charges.joinChargeExGst;

  const edgeMetres = mmToM(finishedEdgeLength(top));
  const edgeRaw = edgeMetres * charges.edgeProfilePerMExGst;

  /*
   * The minimum is applied to the **sum**, not to the area line, and it replaces it rather than
   * adding to it. That is how a fabricator quotes: "$900 minimum" means the invoice says $900, not
   * $900 plus the sink.
   */
  const sum = areaRaw + cutoutRaw + joinRaw + edgeRaw;
  const minimumApplied = sum < charges.minimumChargeExGst;
  const raw = minimumApplied ? charges.minimumChargeExGst : sum;

  return {
    benchtopId: top.id,
    name: top.name,
    materialLabel: label,
    areaM2,
    areaCost: roundCents(areaRaw),
    cutoutCount: top.cutouts.length,
    cutoutCost: roundCents(cutoutRaw),
    joinCount,
    joinCost: roundCents(joinRaw),
    edgeMetres,
    edgeCost: roundCents(edgeRaw),
    edgeProfileName: charges.edgeProfileName,
    minimumApplied,
    // Rounded once at the end, for the reason `effectiveCost` states: the component lines above are
    // a breakdown for a human to read, not five separately invoiced items to round individually.
    totalExGst: effectiveCost(raw, mode),
    indicativePricing: material.indicativePricing,
  };
};

/** Every bought-in top in the job, with what it costs and why. */
export const benchtopCharges = (project: Project): readonly BenchtopCharge[] => {
  const out: BenchtopCharge[] = [];
  for (const top of project.benchtops) {
    const material = findBenchtopMaterial(project.materials, top.materialId);
    if (material.supply !== 'bought-in') continue;
    out.push(chargeFor(top, material, project.settings.gstMode));
  }
  return out;
};

export const benchtopChargeTotal = (charges: readonly BenchtopCharge[]): Cents =>
  charges.reduce((s, c) => s + c.totalExGst, 0);

/**
 * Things about a top that will cost somebody money if nobody says them out loud.
 *
 * An exposed end that nobody has profiled and a cutout nobody has charged both come out of the same
 * failure — a top specified as a rectangle — and both arrive as a variation.
 */
export const benchtopProblems = (project: Project): readonly string[] => {
  const problems: string[] = [];
  for (const top of project.benchtops) {
    const material = findBenchtopMaterial(project.materials, top.materialId);
    if (material.supply !== 'bought-in') continue;
    if (!material.charges) {
      problems.push(
        `${top.name} is bought in as "${material.decor}", which has no fabrication rates on it, ` +
          'so it is quoted at zero. Load the supplier’s rates under Settings → Materials.',
      );
    }
    // Per end, not "either end": a breakfast bar overhanging on the right is perfectly normal
    // alongside a left end that dies into a wall, and a check that only fires when *both* are
    // wrong would let the single most likely mistake through.
    for (const side of ['left', 'right'] as const) {
      if (top.ends[side] === 'wall' && top.overhangs[side] > 0) {
        problems.push(
          `${top.name} overhangs its run by ${Math.round(top.overhangs[side])}mm at the ${side} ` +
            'end, but that end is marked as running into a wall. One of the two is wrong.',
        );
      }
    }
  }
  return problems;
};
