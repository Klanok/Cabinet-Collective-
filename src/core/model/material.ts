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
  /**
   * Roughly what the decor looks like on screen, as a hex colour.
   *
   * **A screen approximation, not a colour match.** Nothing is cut, priced or ordered from it, and
   * nobody should sign off a decor against a monitor — the decor *name* is the fact, and it is what
   * goes on the supplier order. This is here so a walnut door does not render the same off-white as
   * a white melamine carcass, which is most of what makes the 3D view worth showing a client.
   *
   * Optional, and a material without one falls back to the viewport's own colour for that kind of
   * part, exactly as every part did before this existed.
   */
  readonly colour?: string;
  /** Supplier-authored decor image and the physical area represented by one repeat. */
  readonly texture?: {
    readonly url: string;
    readonly repeatLength: Mm;
    readonly repeatWidth: Mm;
    /** Axis in the image that runs with the board grain. */
    readonly grainAxis: 'u' | 'v';
    readonly sourceUrl: string;
  };
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

/**
 * How a stone fabricator quotes.
 *
 * Every line here is a line on a real stone quote, and none of them is derivable from the others.
 * A top is not simply "area × rate": the cutouts are charged, the joins are charged, the edge is
 * charged by the metre and by what profile it is, and under about a square metre and a half none
 * of that matters because the minimum applies.
 */
export interface FabricationCharges {
  readonly ratePerM2ExGst: Cents;
  /** Charged instead of the sum, when the sum comes to less. */
  readonly minimumChargeExGst: Cents;
  /** Per cutout, by what the cutout is for. A sink and a tap hole are not the same money. */
  readonly cutoutChargeExGst: Record<'sink' | 'hob' | 'tap-hole' | 'other', Cents>;
  /** Per join. */
  readonly joinChargeExGst: Cents;
  /** Per metre of finished edge — the front, and any end somebody sees. */
  readonly edgeProfilePerMExGst: Cents;
  /** What the profile is called on the order — "20mm pencil round", "shark nose". */
  readonly edgeProfileName: string;
}

/**
 * A benchtop material — and with it, whether a top of this material is **cut or bought**.
 *
 * Its own record rather than a `SheetMaterial` with a flag, because for most of them there is no
 * sheet: stone is not sold in sheets this shop cuts, it is a service with a square-metre rate. The
 * shop-made ones point *at* a sheet material rather than restating one, so a laminated MDF top and
 * an MDF door panel can never be priced from two different boards.
 */
export interface BenchtopMaterial {
  readonly id: string;
  readonly brand: string;
  readonly decor: string;
  readonly thickness: Mm;
  readonly supply: 'shop-made' | 'bought-in';
  /** Shop-made only: the sheet it is cut from. */
  readonly sheetMaterialId?: string;
  /** Bought-in only: how the fabricator charges for it. */
  readonly charges?: FabricationCharges;
  /** A screen approximation, exactly as `SheetMaterial.colour` is. Nothing is ordered from it. */
  readonly colour?: string;
  readonly indicativePricing: boolean;
}

/** Upholstery is rendered and specified, but is never treated as a sheet part or sent to CAM. */
export interface UpholsteryMaterial {
  readonly id: string;
  readonly brand: string;
  readonly collection: string;
  readonly colour: string;
  readonly colourFallback: string;
  readonly textureUrl: string;
  readonly sourceUrl: string;
  readonly width: Mm;
  readonly composition: string;
  readonly abrasionCycles: number;
}

export interface MaterialLibrary {
  readonly sheets: readonly SheetMaterial[];
  readonly edgeBands: readonly EdgeBandMaterial[];
  readonly benchtops: readonly BenchtopMaterial[];
  /** Optional so existing saved projects remain readable without changing their cut data. */
  readonly upholstery?: readonly UpholsteryMaterial[];
}

/**
 * Fill in the screen colours on stored sheets that predate the field.
 *
 * `SheetMaterial.colour` arrived as an optional field with no migration behind it, and that was a
 * mistake with a very specific and very confusing symptom: a job stores its **own copy** of the
 * material list, so a job saved before the field existed has a list with no colours anywhere in it.
 * Every part then falls back to the viewport's colour for its role — and changing a door from white
 * melamine to walnut moves the cutlist, moves the price, and does not move a single pixel. It looks
 * exactly like the material picker is broken.
 *
 * Matched by **id** against the shipped library, and only where the job has none. A colour a shop
 * has deliberately set is never overwritten.
 *
 * This is the safest possible thing for a migration to change, and worth saying why: nothing is
 * cut, priced or ordered from a colour. The decor *name* is the fact. So unlike every other
 * migration in this codebase, there is no part to protect here — the only risk was leaving it
 * broken.
 */
export const withResolvedColours = (
  sheets: readonly Record<string, unknown>[],
  reference: readonly SheetMaterial[],
): Record<string, unknown>[] =>
  sheets.map((sheet) => {
    if (typeof sheet.colour === 'string' && sheet.colour.length > 0) return sheet;
    const known = reference.find((r) => r.id === sheet.id);
    return known?.colour ? { ...sheet, colour: known.colour } : sheet;
  });

/** Add shipped supplier textures to stored material snapshots without replacing shop edits. */
export const withResolvedTextures = (
  sheets: readonly Record<string, unknown>[],
  reference: readonly SheetMaterial[],
): Record<string, unknown>[] =>
  sheets.map((sheet) => {
    if (sheet.texture && typeof sheet.texture === 'object') return sheet;
    const known = reference.find((r) => r.id === sheet.id);
    return known?.texture ? { ...sheet, texture: known.texture } : sheet;
  });

export const findBenchtopMaterial = (lib: MaterialLibrary, id: string): BenchtopMaterial => {
  const found = lib.benchtops.find((b) => b.id === id);
  if (!found) throw new Error(`Unknown benchtop material: ${id}`);
  return found;
};

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
