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

/**
 * How one sheet size is named when it has to be stored or chosen.
 *
 * A `SheetSize` has no id of its own, and giving it one would mean migrating every material in
 * every saved job to invent identifiers nobody types. Its dimensions already identify it — a
 * material does not come in two different 2400×1200s — so they are the key.
 *
 * Deliberately not the price: a size a shop has *chosen* must keep pointing at that size when
 * the supplier's price changes, which is the whole point of storing a choice rather than an
 * outcome.
 */
export const sheetSizeKey = (s: SheetSize): string => `${s.length}x${s.width}`;

/** Human form of the same thing, for a label or a report line. */
export const sheetSizeLabel = (s: SheetSize): string => `${s.length}×${s.width}`;

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
   * Which way a bendable board will actually bend — **absent on every board that stays flat**.
   *
   * A second direction on the sheet, and it is not the decor's. `grain` is about appearance:
   * whether two parts read as matched, and which way round they are laid so they do.
   * `bendAxis` is structural — bendy ply is manufactured with the plies running one way and it
   * rolls around one axis only. Sold as **column form** or **barrel form**, and a shop buys both.
   *
   * The two must not share a field. Bendy ply's decor is nothing — it is a substrate, laminated
   * over — so its `grain` is honestly `none`, and `none` is exactly what tells the nester every
   * part on it may rotate freely. It does, and it turned both skins of the first radiused end
   * that was measured. The blank came out the right size, off a sheet that will not bend that
   * way: **the same size and completely wrong**, which is the fault this codebase's whole
   * verification standard exists to catch.
   *
   * Stated as the sheet axis the part's **length** must run along to bend, because the part is
   * what has to be laid: a skin is cut flat to its developed length and curls *along* that
   * length, so that length has to lie the way the board rolls.
   *
   * **Confirmed at the bench**: *"you have it right on the column"* — column form bends **along
   * the sheet's length**, which is the reading this repo had shipped and had never had checked.
   * Barrel is the other axis by definition. It stays a setting rather than a constant because
   * the shop buys both forms, not because the mapping is in doubt; there is nothing left on a
   * "not yet checked" list about it, and the caution that used to appear on the Materials tab is
   * gone rather than left standing next to an answer.
   */
  readonly bendAxis?: 'length' | 'width';
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

/**
 * How an upholsterer quotes a banquette.
 *
 * **One rate by the lineal metre, charged separately for every cushion**, from the shop:
 *
 * > "I generally allow $350 per lineal metre — that applies to the base and separately to the back
 * > or any returns, so 1 lineal metre of banquette with base and back would be $700."
 *
 * That is the whole pricing model and it is deliberately not dressed up as more. There is no area
 * term, because an upholsterer quoting a banquette measures along it; no fabric line, because the
 * cushions are **bought in as finished units** and the fabric is theirs; and no foam line for the
 * same reason. The shop supplies templates or a particleboard substrate and takes delivery of
 * cushions.
 *
 * **There is no minimum charge here, and its absence is deliberate rather than an omission.** A
 * stone fabricator's minimum is on `FabricationCharges` because it was stated; nobody has said
 * whether this upholsterer has one. Inventing a plausible figure is the failure the unchecked list
 * exists to prevent, so it is written down as an open question instead — see §5.4.
 */
export interface UpholsteryCharges {
  /**
   * Per lineal metre of one cushion, ex GST.
   *
   * Applied **per piece, not per banquette**: a seat and a back over the same metre are two
   * cushions and two charges. That is the shop's own arithmetic and it is what makes the
   * reference figure — 1m with a base and a back — come to $700 rather than $350.
   */
  readonly perLinealMetreExGst: Cents;
}

/** Upholstery is rendered and specified, but is never treated as a sheet part or sent to CAM. */
export interface UpholsteryMaterial {
  readonly id: string;
  readonly brand: string;
  readonly collection: string;
  readonly colour: string;
  readonly colourFallback: string;
  readonly textureUrl: string;
  /**
   * How much real fabric one tile of `textureUrl` covers, edge to edge.
   *
   * **Required, and the reason is a bug rather than tidiness.** The cushion meshes are
   * `ExtrudeGeometry`, whose default UV generator emits **shape coordinates — millimetres** —
   * rather than a normalised 0..1. Scaling the map by anything that is not a real distance
   * therefore multiplies an already-huge number: a 1190mm seat came out at roughly 5,800 tiles
   * across, every screen pixel averaged the whole swatch, and the fabric rendered as flat
   * off-white. It looked exactly like a texture that had failed to load, and was not.
   *
   * So this is a physical size and the mesh divides millimetres by it. Same rule §5.8 sets for
   * board decors, for the same reason: a weave is a real distance, and a cushion and a wall of
   * doors have to show it at the same scale to be worth looking at.
   *
   * **The shipped figure is an estimate and is flagged as one** — see `SWATCH_COVERS` in
   * `library/upholstery.au.ts`. Warwick publish the swatch as an image, not as a scale, so the
   * only way to make it exact is to measure a real sample against the picture.
   */
  readonly textureRepeat: Mm;
  readonly sourceUrl: string;
  readonly width: Mm;
  readonly composition: string;
  readonly abrasionCycles: number;
  /**
   * What the upholsterer charges to make cushions in this fabric.
   *
   * Optional because a job saved before cushions were costed has a snapshot of the library without
   * it, and **a rate that is absent must not silently become zero** — that is the whole failure
   * this field exists to end. A banquette whose fabric carries no charges is reported, in words, on
   * the quote and in the report.
   */
  readonly charges?: UpholsteryCharges;
  /** Placeholder money, flagged exactly as `SheetMaterial` and `BenchtopMaterial` flag theirs. */
  readonly indicativePricing?: boolean;
}

/**
 * The fabric a cabinet's cushions are made in.
 *
 * One description, because the viewport and the quote must never disagree about it: a cushion you
 * can see in a fabric and a cushion charged at another fabric's rate is the class of fault §2 has
 * scar tissue about. The fallbacks are the ones the viewport has always used — the job's own list,
 * then the shipped one, then its first entry when the cabinet names nothing.
 */
export const findUpholstery = (
  materials: MaterialLibrary,
  id: string | undefined,
  shipped: readonly UpholsteryMaterial[],
): UpholsteryMaterial | undefined => {
  const list = materials.upholstery ?? shipped;
  return list.find((item) => item.id === id) ?? list[0];
};

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

/*
 * `unconfirmedBendAxis` used to live here, reporting every bendable board as a reading nobody
 * had checked. The shop checked it — *"you have it right on the column"* — so the reading is a
 * measurement and the list is gone rather than kept returning nothing.
 *
 * Deleted rather than emptied on purpose. A function that always answers "no problems" and a
 * screen block that never draws are §5.11's *safety net nothing renders* wearing the opposite
 * face: the next reader finds a caution mechanism, assumes the bench question is still live,
 * and asks it again. The answer is in `SheetMaterial.bendAxis` above, where the field is.
 */
