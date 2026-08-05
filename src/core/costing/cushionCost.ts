/**
 * What a banquette's cushions cost.
 *
 * ## They are bought in, and that is the whole design
 *
 * From the shop: *"generally bought in as a whole unit from the upholsterer — we'd only supply
 * templates or particleboard substrates."* So a cushion is the same class of thing as a stone
 * benchtop (§4.7): **a purchase order, not a part.** Nothing here produces a `Panel`, nothing
 * reaches the nest, nothing reaches the cutlist, and that zero is the point rather than an
 * omission — inventing a part so the cutlist looked complete would put foam on a sheet order.
 *
 * ## The arithmetic is one line, and it is the shop's
 *
 * > "I generally allow $350 per lineal metre — that applies to the base and separately to the back
 * > or any returns, so 1 lineal metre of banquette with base and back would be $700."
 *
 * Charged **per piece**, which is the whole of what makes that reference figure come to $700 rather
 * than $350. A seat and a back over the same metre are two cushions and two charges. There is no
 * area term and no fabric line, because the upholsterer supplies both.
 *
 * ## Why this existed as a bug rather than as a gap
 *
 * §5.11 recorded that the cushions were *"drawn but not costed — no fabric, no foam, no upholstery
 * labour on the quote, and nothing on the report says so"*. The second half is the serious half.
 * A missing line that announces itself is a job to finish; a missing line that quotes silently at
 * **zero** is a banquette sold for hundreds less than it costs, and nothing on the page says which
 * you are looking at. That is the same shape as the NaN quote in §4.14: a number that looks
 * finished and is not.
 *
 * So a banquette whose fabric carries no rate is **reported in words**, and never quietly costed at
 * nothing.
 */

import { type Cents, type Mm, mm, mmToM, roundCents } from '../units.ts';
import type { Cabinet } from '../model/cabinet.ts';
import {
  type CushionPiece,
  cornerCushionPieces,
  cornerSeatRadius,
  cushionPieces,
  seatCushionPlan,
} from '../model/cushion.ts';
import { type UpholsteryMaterial, findUpholstery } from '../model/material.ts';
import type { Project } from '../model/project.ts';
import { AU_UPHOLSTERY_MATERIALS } from '../library/upholstery.au.ts';
import { buildCabinet } from '../rules/build.ts';
import { effectiveCost } from './gst.ts';

/** One cushion, priced. */
export interface CushionLine extends CushionPiece {
  readonly linealM: number;
  readonly costExGst: Cents;
}

export interface CushionCharge {
  readonly cabinetId: string;
  readonly cabinetName: string;
  /** What the fabric is called on the order — "Warwick Caulfield Oatmeal". */
  readonly fabricLabel: string;
  readonly ratePerLinealMetreExGst: Cents;
  readonly lines: readonly CushionLine[];
  readonly linealM: number;
  readonly totalExGst: Cents;
  readonly indicativePricing: boolean;
}

/** Cabinets that carry upholstery. Nothing else in the model has cushions on it. */
const isUpholstered = (cabinet: Cabinet): boolean =>
  cabinet.typeId === 'banquette' || cabinet.typeId === 'banquette-corner';

const fabricLabel = (fabric: UpholsteryMaterial): string =>
  `${fabric.brand} ${fabric.collection} ${fabric.colour}`;

/**
 * The cushions on one cabinet, before they are priced.
 *
 * **The corner unit's radius is read the way the mesh reads it** and the plain banquette's plan is
 * built the way the mesh builds it, both out of `model/cushion.ts`. Nothing is measured twice.
 *
 * The plain banquette needs the cabinet's **resolved** corner radius rather than the option, for
 * the reason `SeatCushionInput.round` sets out: a radius the bendy ply cannot turn comes back null
 * from the rule engine and the carcass is built square, so pricing a curved cushion off the raw
 * option would charge for a curve that was never built.
 */
const piecesFor = (cabinet: Cabinet, project: Project): readonly CushionPiece[] => {
  const overhang = mm(cabinet.options.seatCushionOverhang ?? 10);
  const hasBack = cabinet.options.hasBackCushion !== false;

  if (cabinet.typeId === 'banquette-corner') {
    return cornerCushionPieces(cornerSeatRadius(cabinet.width, cabinet.depth), hasBack);
  }

  const built = buildCabinet(cabinet, project);
  const radius = built.radius;
  const plan = seatCushionPlan({
    W: cabinet.width,
    D: cabinet.depth,
    // The plane the engine settled on, not `depth + a standoff + a board` worked out again here.
    finishedFrontZ: built.finishedFrontZ,
    overhang,
    round: radius ? { corner: radius.corner, radius: radius.r } : null,
  });
  return cushionPieces({
    plan,
    hasBackCushion: hasBack,
    backCushionThickness: mm(cabinet.options.backCushionThickness ?? 80),
    leftEndCushion: cabinet.options.leftEndCushion === true,
    rightEndCushion: cabinet.options.rightEndCushion === true,
  });
};

const priced = (piece: CushionPiece, rate: Cents, gstMode: Project['settings']['gstMode']): CushionLine => {
  const linealM = mmToM(piece.linealMm as Mm);
  return {
    ...piece,
    linealM,
    costExGst: roundCents(linealM * effectiveCost(rate, gstMode)),
  };
};

/**
 * Every upholstered cabinet in the job, itemised.
 *
 * Itemised rather than totalled because the breakdown is what gets checked against the
 * upholsterer's own quote — the same argument `benchtopCharges` makes about a stone invoice. A
 * banquette that came back dearer than expected is a conversation about which cushion, not about a
 * total.
 */
export const cushionCharges = (project: Project): readonly CushionCharge[] => {
  const charges: CushionCharge[] = [];
  for (const cabinet of project.cabinets) {
    if (!isUpholstered(cabinet)) continue;
    const fabric = findUpholstery(
      project.materials,
      cabinet.materials.upholstery,
      AU_UPHOLSTERY_MATERIALS,
    );
    const rate = fabric?.charges?.perLinealMetreExGst;
    // No rate is not a zero charge — it is a problem, and `cushionProblems` is where it is said.
    if (!fabric || rate === undefined) continue;

    const lines = piecesFor(cabinet, project).map((piece) =>
      priced(piece, rate, project.settings.gstMode),
    );
    charges.push({
      cabinetId: cabinet.id,
      cabinetName: cabinet.name,
      fabricLabel: fabricLabel(fabric),
      ratePerLinealMetreExGst: rate,
      lines,
      linealM: lines.reduce((sum, line) => sum + line.linealM, 0),
      totalExGst: lines.reduce((sum, line) => sum + line.costExGst, 0) as Cents,
      indicativePricing: fabric.indicativePricing === true,
    });
  }
  return charges;
};

export const cushionChargeTotal = (charges: readonly CushionCharge[]): Cents =>
  charges.reduce((sum, charge) => sum + charge.totalExGst, 0) as Cents;

/**
 * Banquettes whose cushions could not be priced.
 *
 * **This is the half of §5.11 that mattered.** A cushion nobody can price is drawn on screen and
 * costs nothing on the quote, and without this the quote looks complete. Reported by name, with the
 * cabinet named, so it is actionable rather than a caveat.
 */
export const cushionProblems = (project: Project): readonly string[] => {
  const problems: string[] = [];
  for (const cabinet of project.cabinets) {
    if (!isUpholstered(cabinet)) continue;
    const fabric = findUpholstery(
      project.materials,
      cabinet.materials.upholstery,
      AU_UPHOLSTERY_MATERIALS,
    );
    if (!fabric) {
      problems.push(
        `${cabinet.name} has cushions but no upholstery fabric to make them in, so nothing is charged for them. Choose a fabric.`,
      );
      continue;
    }
    if (fabric.charges?.perLinealMetreExGst === undefined) {
      problems.push(
        `${cabinet.name}'s cushions are drawn but not charged — ${fabricLabel(fabric)} has no upholsterer's rate on it. Set a rate per lineal metre, or the seat and back are being quoted at nothing.`,
      );
    }
  }
  return problems;
};
