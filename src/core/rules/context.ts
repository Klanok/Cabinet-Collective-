/**
 * The derived values a cabinet spec works from.
 *
 * A spec never reaches into a `Project`. It gets a context — the driving dimensions plus the
 * handful of quantities that fall straight out of the construction method — which is what
 * keeps specs declarative and independently testable.
 */

import { type Mm, mm } from '../units.ts';
import type { Cabinet, CabinetOptions } from '../model/cabinet.ts';
import {
  type ConstructionMethod,
  horizontalDepth,
  sideDepth,
} from '../model/construction.ts';

/** The resolved material ids for one cabinet, defaults already applied. */
export interface ResolvedMaterials {
  readonly carcass: string;
  readonly back: string;
  readonly door: string;
  readonly edgeBand: string;
}

export interface RuleContext {
  readonly cabinet: Cabinet;
  readonly construction: ConstructionMethod;
  readonly materials: ResolvedMaterials;
  readonly options: CabinetOptions;

  /** Driving dimensions. */
  readonly W: Mm;
  readonly H: Mm;
  readonly D: Mm;

  /** Carcass, back and door thicknesses. */
  readonly t: Mm;
  readonly tb: Mm;
  readonly td: Mm;

  /** Clear width between the sides. */
  readonly interiorWidth: Mm;
  /** Clear height between bottom and top/stretchers. */
  readonly interiorHeight: Mm;
  /** Front-to-back size of a side panel. */
  readonly sideDepth: Mm;
  /** Front-to-back size of the horizontals. */
  readonly horizontalDepth: Mm;
  /** Cabinet-space z of the front face of the back panel — where the interior starts. */
  readonly interiorBackZ: Mm;
}

export const buildContext = (
  cabinet: Cabinet,
  construction: ConstructionMethod,
  materials: ResolvedMaterials,
): RuleContext => {
  const t = construction.carcassThickness;
  const tb = construction.backThickness;
  const { width: W, height: H, depth: D } = cabinet;

  return {
    cabinet,
    construction,
    materials,
    options: cabinet.options,
    W,
    H,
    D,
    t,
    tb,
    td: construction.doorThickness,
    interiorWidth: mm(W - 2 * t),
    interiorHeight: mm(H - 2 * t),
    sideDepth: sideDepth(construction, D),
    horizontalDepth: horizontalDepth(construction, D),
    // Under both back styles the back occupies z ∈ [0, tb], so the interior starts at tb.
    interiorBackZ: tb,
  };
};

/** Validate driving dimensions before any parts get built. */
export const validateContext = (ctx: RuleContext): string[] => {
  const problems: string[] = [];
  if (ctx.interiorWidth <= 0) {
    problems.push(
      `Width ${ctx.W}mm is too narrow for ${ctx.t}mm sides — no interior opening remains.`,
    );
  }
  if (ctx.interiorHeight <= 0) {
    problems.push(`Height ${ctx.H}mm is too short for ${ctx.t}mm horizontals.`);
  }
  if (ctx.horizontalDepth <= 0) {
    problems.push(`Depth ${ctx.D}mm is not deeper than the ${ctx.tb}mm back panel.`);
  }
  return problems;
};
