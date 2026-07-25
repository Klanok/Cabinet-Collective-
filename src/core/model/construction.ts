/**
 * Construction methods.
 *
 * A construction method is *data*: the set of dimensional conventions a shop builds to.
 * Cabinet specs read these values rather than hard-coding them, which is what lets the same
 * base-cabinet spec produce a 16mm inset-back carcass or an 18mm applied-back one without a
 * branch anywhere in the rule engine.
 *
 * The default is frameless (European 32mm system) because that is how cabinets are built
 * here. Face-frame is a construction method to be added later, not the baseline this engine
 * is shaped around.
 */

import { type Mm, mm } from '../units.ts';

export type ConstructionFamily = 'frameless-32' | 'face-frame';

/**
 * How the back panel is housed.
 *
 * - `applied`: back covers the full rear face of the carcass. Carcass depth includes it, so
 *   sides and horizontals are `depth - backThickness` deep.
 * - `inset`: back sits between the sides, flush with the rear. Sides run the full depth;
 *   horizontals are `depth - backThickness`.
 */
export type BackStyle = 'applied' | 'inset';

export interface ConstructionMethod {
  readonly id: string;
  readonly name: string;
  readonly family: ConstructionFamily;

  readonly carcassThickness: Mm;
  readonly backThickness: Mm;
  readonly doorThickness: Mm;
  readonly backStyle: BackStyle;

  /** Height of the toe kick a base cabinet stands on. */
  readonly kickHeight: Mm;
  /** How far the kick is recessed behind the door face. */
  readonly kickSetback: Mm;
  /** Depth (front-to-back size) of the top rails on a base cabinet. */
  readonly stretcherWidth: Mm;

  /** Gap between two adjacent fronts on the same cabinet. */
  readonly frontGap: Mm;
  /** Reveal between a front and the outer edge of its carcass, per side. */
  readonly frontReveal: Mm;

  /** How much shallower an adjustable shelf is than the opening. */
  readonly shelfSetback: Mm;
  /** Total side clearance for an adjustable shelf — half taken off each end. */
  readonly shelfSideClearance: Mm;

  /** System 32 hole pitch. */
  readonly systemPitch: Mm;
  /** Distance from the front edge to the front line of system holes. */
  readonly systemFrontSetback: Mm;
}

/**
 * The default: 16mm melamine carcass, 18mm doors, applied back, 150mm kick.
 * These are AU volume-kitchen conventions, not a generic starting point.
 */
export const FRAMELESS_32_16MM: ConstructionMethod = {
  id: 'frameless-32-16',
  name: 'Frameless 32mm — 16mm carcass',
  family: 'frameless-32',
  carcassThickness: mm(16),
  backThickness: mm(16),
  doorThickness: mm(18),
  backStyle: 'applied',
  kickHeight: mm(150),
  kickSetback: mm(50),
  stretcherWidth: mm(100),
  frontGap: mm(3),
  frontReveal: mm(1.5),
  shelfSetback: mm(10),
  shelfSideClearance: mm(2),
  systemPitch: mm(32),
  systemFrontSetback: mm(37),
};

/** Heavier commercial-fitout variant. */
export const FRAMELESS_32_18MM: ConstructionMethod = {
  ...FRAMELESS_32_16MM,
  id: 'frameless-32-18',
  name: 'Frameless 32mm — 18mm carcass',
  carcassThickness: mm(18),
  backThickness: mm(18),
};

export const DEFAULT_CONSTRUCTIONS: readonly ConstructionMethod[] = [
  FRAMELESS_32_16MM,
  FRAMELESS_32_18MM,
];

export const findConstruction = (
  methods: readonly ConstructionMethod[],
  id: string,
): ConstructionMethod => {
  const found = methods.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown construction method: ${id}`);
  return found;
};

/**
 * Front-to-back depth of the carcass horizontals (bottom, top, stretchers), which stop short
 * of the back panel under both back styles.
 */
export const horizontalDepth = (c: ConstructionMethod, cabinetDepth: Mm): Mm =>
  mm(cabinetDepth - c.backThickness);

/** Front-to-back depth of a side panel — the one dimension the back style actually changes. */
export const sideDepth = (c: ConstructionMethod, cabinetDepth: Mm): Mm =>
  c.backStyle === 'applied' ? mm(cabinetDepth - c.backThickness) : cabinetDepth;
