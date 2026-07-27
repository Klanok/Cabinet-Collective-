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
import { type MaterialLibrary, actualThicknessOf, findSheet } from '../model/material.ts';

/** The resolved material ids for one cabinet, defaults already applied. */
export interface ResolvedMaterials {
  readonly carcass: string;
  readonly back: string;
  readonly door: string;
  /** Bendy ply for a formed skin. Resolved for every cabinet; cut only by curved ones. */
  readonly skin: string;
  readonly edgeBand: string;
}

/**
 * The thicknesses a cabinet is actually built from.
 *
 * These come from the **boards**, not from the construction method. A construction method
 * declares the nominal board it is designed around — "frameless 32mm, 16mm carcass" — but the
 * arithmetic has to follow the sheet that will really be cut, because that is the thing the
 * parts have to fit between. Nominal 16mm melamine measures about 16.3, and a bottom panel
 * calculated at 16 is 0.6mm too wide to go in.
 */
export interface BuildThicknesses {
  readonly carcass: Mm;
  readonly back: Mm;
  readonly door: Mm;
  /**
   * Bendy ply. This one does something none of the others do: it sets a **length**.
   *
   * Every other thickness here decides how a part fits between two others. A skin's thickness
   * decides how far round the curve its neutral axis runs, and therefore how long to cut it —
   * so a board that measures 3.2 rather than 3 makes the skin longer, not tighter.
   */
  readonly skin: Mm;
}

export const thicknessesFor = (
  materials: ResolvedMaterials,
  library: MaterialLibrary,
): BuildThicknesses => ({
  carcass: actualThicknessOf(findSheet(library, materials.carcass)),
  back: actualThicknessOf(findSheet(library, materials.back)),
  door: actualThicknessOf(findSheet(library, materials.door)),
  skin: actualThicknessOf(findSheet(library, materials.skin)),
});

export interface RuleContext {
  readonly cabinet: Cabinet;
  readonly construction: ConstructionMethod;
  readonly materials: ResolvedMaterials;
  readonly options: CabinetOptions;

  /** Driving dimensions. */
  readonly W: Mm;
  readonly H: Mm;
  readonly D: Mm;

  /**
   * Carcass, back and door thicknesses — **as the boards really measure**, not as they are
   * named. See `BuildThicknesses`.
   */
  readonly t: Mm;
  readonly tb: Mm;
  readonly td: Mm;
  /** Bendy ply thickness — decides a skin's developed length, not a fit. */
  readonly ts: Mm;

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
  thicknesses: BuildThicknesses,
): RuleContext => {
  const t = thicknesses.carcass;
  const tb = thicknesses.back;
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
    td: thicknesses.door,
    ts: thicknesses.skin,
    interiorWidth: mm(W - 2 * t),
    interiorHeight: mm(H - 2 * t),
    sideDepth: sideDepth(construction, D, tb),
    horizontalDepth: horizontalDepth(D, tb),
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
