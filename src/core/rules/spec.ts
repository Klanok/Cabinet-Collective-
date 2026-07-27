/**
 * The parametric rule engine's vocabulary.
 *
 * A cabinet spec is a *list of part rules* — data describing how each part is derived from
 * the driving dimensions. Adding a cabinet type means adding a spec file and registering it.
 * It must never mean touching the geometry engine, the viewport, or costing.
 */

import type { Mm } from '../units.ts';
import type { CabinetOptions, CabinetTypeId } from '../model/cabinet.ts';
import type { GrainConstraint, PanelRole } from '../model/panel.ts';
import type { PanelFeature } from '../model/feature.ts';
import type { Forming } from '../model/forming.ts';
import type { PanelPlacement } from '../geom/placement.ts';
import type { Profile2D } from '../geom/profile.ts';
import { type SignedAxis, negateAxis } from '../geom/vec.ts';
import type { RectEdge } from '../geom/profile.ts';
import type { RuleContext } from './context.ts';

/** Which of a cabinet's material slots a part is cut from. */
export type MaterialSlot = 'carcass' | 'back' | 'door' | 'skin';

/**
 * Edges to band, named by the cabinet-space direction the edge faces rather than by part-space
 * edge name.
 *
 * This matters more than it looks. "Band the edge facing the front of the cabinet" is the
 * actual rule; which named edge that turns out to be depends on the panel's placement, and
 * differs between a left and a right side. Expressing the rule directionally means handed
 * parts come out right without the spec having to know it is describing a handed part.
 */
export type BandingRule = readonly SignedAxis[];

/** One concrete part produced by a rule. */
export interface PartInstance {
  readonly name: string;
  readonly role: PanelRole;
  readonly profile: Profile2D;
  readonly placement: PanelPlacement;
  readonly material: MaterialSlot;
  readonly bandedDirections: BandingRule;
  readonly grain: GrainConstraint;
  readonly features?: readonly PanelFeature[];
  /** How the part bends after cutting. `profile` stays the flat, as-cut shape regardless. */
  readonly forming?: Forming;
  readonly note?: string;
}

/**
 * A part rule: a stable key plus a function producing zero or more instances from context.
 *
 * The function form is what keeps this type-checked while staying data — a rule is a value in
 * a list, not a branch in the engine.
 */
export interface PartRule {
  readonly key: string;
  readonly produce: (ctx: RuleContext) => readonly PartInstance[];
}

export interface CabinetSpec {
  readonly typeId: CabinetTypeId;
  readonly name: string;
  /** Applied when a cabinet of this type doesn't specify them. */
  readonly defaultOptions: CabinetOptions;
  readonly parts: readonly PartRule[];
  /** Type-specific sanity checks, run before parts are produced. */
  readonly validate?: (ctx: RuleContext) => string[];
  /** Vertical offset of the carcass above its anchor — the kick, for a base cabinet. */
  readonly carcassLift?: (ctx: RuleContext) => Mm;
}

/**
 * Which named edge of a rectangular panel faces the given cabinet-space direction.
 *
 * Part-space outward normals map to cabinet space through the placement axes:
 *   L1 (y=0) → −v      L2 (y=width) → +v
 *   W1 (x=0) → −u      W2 (x=length) → +u
 *
 * Returns null for the two thickness faces, which are not edges.
 */
export const edgeFacing = (p: PanelPlacement, direction: SignedAxis): RectEdge | null => {
  if (direction === p.v) return 'L2';
  if (direction === negateAxis(p.v)) return 'L1';
  if (direction === p.u) return 'W2';
  if (direction === negateAxis(p.u)) return 'W1';
  return null;
};

/** Resolve a directional banding rule into the concrete edges of one placed panel. */
export const resolveBanding = (
  p: PanelPlacement,
  rule: BandingRule,
  bandId: string,
): Partial<Record<RectEdge, string>> => {
  const banding: Partial<Record<RectEdge, string>> = {};
  for (const direction of rule) {
    const edge = edgeFacing(p, direction);
    if (edge) banding[edge] = bandId;
  }
  return banding;
};

/** Band the edge that faces the front of the cabinet — by far the commonest rule. */
export const BAND_FRONT: BandingRule = ['+Z'];
/** Band all four edges — doors, drawer fronts, exposed end panels. */
export const BAND_ALL: BandingRule = ['+Z', '-Z', '+X', '-X', '+Y', '-Y'];
export const BAND_NONE: BandingRule = [];
