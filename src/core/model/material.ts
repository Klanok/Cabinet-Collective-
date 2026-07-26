/**
 * Materials — sheet goods and edge banding.
 *
 * Costing and CAM read the same material record, so a part can never be priced as one
 * material and cut as another.
 */

import type { Cents, Mm } from '../units.ts';

export type SubstrateKind =
  | 'MFPB' // melamine-faced particleboard — the default carcass material
  | 'HMR-MFPB' // moisture resistant, for wet areas
  | 'MDF' // the default door/panel substrate
  | 'HMR-MDF'
  | 'plywood'
  | 'raw-particleboard';

/**
 * Whether the decor is directional. Grain-matched jobs constrain nesting rotation in Phase 3,
 * so it is recorded on the material rather than decided per-part later.
 */
export type GrainDirection =
  | 'none' // solid colour — parts may rotate freely when nesting
  | 'length' // grain runs along the sheet's long axis
  | 'width';

export interface SheetSize {
  readonly length: Mm;
  readonly width: Mm;
  /** Ex-GST trade price for one sheet. */
  readonly priceExGst: Cents;
}

export interface SheetMaterial {
  readonly id: string;
  readonly brand: string;
  /** The decor name as it appears on a supplier order. */
  readonly decor: string;
  readonly substrate: SubstrateKind;
  /**
   * The **nominal** thickness — what the board is called, ordered and invoiced as. "16mm".
   *
   * This is a name, not a measurement. It groups the cutlist, labels the sheet order and sorts
   * the sheet schedule. Nothing is calculated from it.
   */
  readonly thickness: Mm;
  /**
   * What the board actually measures, when that differs from what it is called.
   *
   * Nominal 16mm melamine particleboard runs about 16.3mm. Every part that fits *between* two
   * boards depends on the real figure: a bottom panel is `W − 2 × thickness`, so calculating
   * it at 16 makes it 0.6mm too wide to fit between the sides. The same applies to grooves,
   * dados and rebates, and Phase 3's nesting and Phase 4's CAM both need the real number too.
   *
   * Unset means "it measures what it says", which is what every material ships as — adopting
   * a real figure is a deliberate, per-material edit rather than something that happens to a
   * saved job behind your back. Read it through `actualThicknessOf`, never directly.
   */
  readonly actualThickness?: Mm;
  readonly grain: GrainDirection;
  /** How many faces carry the decor. Single-sided stock constrains which face is the A-face. */
  readonly decorFaces: 1 | 2;
  readonly sheets: readonly SheetSize[];
  /**
   * True when the price is a placeholder rather than this shop's actual trade price.
   * Costing surfaces this so a quote built on guessed rates can't be mistaken for a real one.
   */
  readonly indicativePricing: boolean;
}

export interface EdgeBandMaterial {
  readonly id: string;
  readonly brand: string;
  readonly decor: string;
  readonly thickness: Mm;
  /** Roll width. Must cover the panel thickness it is applied to. */
  readonly width: Mm;
  readonly pricePerMetreExGst: Cents;
  readonly indicativePricing: boolean;
}

/** Which edges of a panel get banded, and with what. */
export type EdgeBanding = Partial<Record<'L1' | 'L2' | 'W1' | 'W2', string>>;

export interface MaterialLibrary {
  readonly sheets: readonly SheetMaterial[];
  readonly edgeBands: readonly EdgeBandMaterial[];
}

/**
 * What this board really measures — the number everything dimensional works from.
 *
 * Falls back to the nominal figure, so a material that has never been measured behaves exactly
 * as it always did.
 */
export const actualThicknessOf = (m: SheetMaterial): Mm => m.actualThickness ?? m.thickness;

/** True when the board doesn't measure what it's called, and the difference is worth saying. */
export const isOversize = (m: SheetMaterial): boolean =>
  Math.abs(actualThicknessOf(m) - m.thickness) > 0.001;

export const findSheet = (lib: MaterialLibrary, id: string): SheetMaterial => {
  const found = lib.sheets.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown sheet material: ${id}`);
  return found;
};

export const findEdgeBand = (lib: MaterialLibrary, id: string): EdgeBandMaterial => {
  const found = lib.edgeBands.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown edge band: ${id}`);
  return found;
};

/**
 * Cheapest per-m² sheet size for this material, used for area-based costing before Phase 3's
 * nesting can give a real sheet count.
 */
export const bestValueSheet = (m: SheetMaterial): SheetSize => {
  if (m.sheets.length === 0) throw new Error(`Material ${m.id} has no sheet sizes`);
  return m.sheets.reduce((best, s) => {
    const rate = s.priceExGst / (s.length * s.width);
    const bestRate = best.priceExGst / (best.length * best.width);
    return rate < bestRate ? s : best;
  });
};

/** Smallest sheet that a part of this size fits on, respecting grain. Null if nothing fits. */
export const smallestSheetFitting = (
  m: SheetMaterial,
  length: Mm,
  width: Mm,
): SheetSize | null => {
  const candidates = m.sheets.filter((s) => {
    const fitsAligned = length <= s.length && width <= s.width;
    // A part may only be turned 90° when the decor has no direction.
    const fitsRotated = m.grain === 'none' && width <= s.length && length <= s.width;
    return fitsAligned || fitsRotated;
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.length * a.width <= b.length * b.width ? a : b));
};
