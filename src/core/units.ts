/**
 * Units. Millimetres, everywhere, always.
 *
 * There is deliberately no conversion layer in this codebase. `Mm` is a branded number so
 * that a raw number can't drift in from a UI field or a parsed file without passing through
 * `mm()`, but it carries no runtime cost.
 */

declare const MmBrand: unique symbol;

/** A length in millimetres. */
export type Mm = number & { readonly [MmBrand]?: typeof MmBrand };

/** Square millimetres. Kept as a plain number — area only ever feeds costing. */
export type Mm2 = number;

/** Money, in whole cents AUD. Integer cents avoids float drift across a 200-part cutlist. */
export type Cents = number;

export const mm = (n: number): Mm => n as Mm;

/** Machining tolerances below this are treated as zero when comparing geometry. */
export const GEOMETRIC_EPSILON: Mm = mm(1e-6);

/**
 * Drop arithmetic noise below the geometric epsilon — a nanometre.
 *
 * Straight parts come out of pure additions and subtractions of the numbers somebody typed,
 * so they land exact. A curve doesn't: the deepest point of a radiused shelf is found through
 * a centre and a radius, and comes back as 350.0000000000002. That is not a measurement, it
 * is the last bit of a double, and letting it through means a part size that fails an equality
 * check and a nest that reserves a phantom fraction. Nothing in cabinetmaking is meaningful
 * below a micron, let alone a nanometre, so it is safe to round here — and legitimate figures
 * like a 867.4mm panel pass through untouched.
 */
export const snapGeometric = (n: number): Mm => mm(Math.round(n * 1e6) / 1e6);

export const nearlyEqual = (a: Mm, b: Mm, epsilon: Mm = GEOMETRIC_EPSILON): boolean =>
  Math.abs(a - b) <= epsilon;

/** mm² → m², for sheet-goods pricing. */
export const mm2ToM2 = (area: Mm2): number => area / 1_000_000;

/** mm → linear metres, for edge banding. */
export const mmToM = (length: Mm): number => length / 1000;

export const centsToAud = (c: Cents): number => c / 100;

export const formatAud = (c: Cents): string =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(centsToAud(c));

/** Round to whole cents. Every money value crossing a module boundary passes through this. */
export const roundCents = (c: number): Cents => Math.round(c);
