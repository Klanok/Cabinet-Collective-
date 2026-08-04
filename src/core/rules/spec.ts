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
import type { MachiningFace, PanelFeature } from '../model/feature.ts';
import type { Forming } from '../model/forming.ts';
import { type PanelPlacement, placementNormal } from '../geom/placement.ts';
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

/**
 * One thing a spec either builds or does not: `true`, or the reason it does not, in the shop's
 * words.
 *
 * **Refusing costs a sentence, and that is the point of the type.** A boolean lets a spec say
 * "no" and leave the app to invent a reason from the type id — which is where the warning
 * `'A rounded corner is only built on base, wall and tall cabinets'` came from, and why it went
 * on saying it for months after the banquette started cutting formers and a wrap. A list of
 * type ids held somewhere else is a second source of truth about what a spec does, and the spec
 * is the only thing that actually knows.
 *
 * So the reason travels with the declaration, is written once by the spec that owns it, and is
 * what the user is shown verbatim. A capability that goes from `false` to built is a one-line
 * edit in one file, and it cannot be half-done.
 */
export type Capability = true | string;

/**
 * What a spec is built to do, stated by the spec itself.
 *
 * Every field is **required** — there is no default and there is deliberately no "assume yes".
 * A new spec that forgets to answer does not compile, which is the whole mechanism: the
 * alternative is a spec that silently inherits a capability it does not implement and produces
 * a cabinet with the corner cut away and nothing wrapped round it.
 *
 * The rule for what belongs here: a capability is a **cabinet option that some specs build parts
 * for and others do not**. Anything every spec implements is not a capability, it is the engine.
 */
export interface SpecCapabilities {
  /**
   * `carcassRadius` on a named front corner: the spec cuts the corner formers and the bendy-ply
   * wrap. The shared carcass builders take the radius for any type — a bottom loses its corner
   * whatever spec asked for it — so a spec that takes the radius without cutting the formers and
   * the wrap produces a cabinet with a hole in the end of it.
   */
  readonly cornerRadius: Capability;
  /** `appliedEnds`: the spec emits the board laid over an exposed carcass side. */
  readonly appliedEnds: Capability;
  /**
   * `Cabinet.customFeatures`: a hole, a notch or a groove put on one named part by hand.
   *
   * True for anything that cuts parts, because a custom feature lands on a **part** and the
   * question is only whether there is one to land on. A type that produces no parts has nothing
   * to machine and says so in its own words — otherwise a feature added to it would be reported
   * as missing its part every time the job was opened, with nothing on screen to explain why.
   */
  readonly customFeatures: Capability;
}

/** The reason a capability is off, or `null` when it is on. */
export const refusalOf = (capability: Capability): string | null =>
  capability === true ? null : capability;

export interface CabinetSpec {
  readonly typeId: CabinetTypeId;
  readonly name: string;
  /** What this spec builds, and the reason in plain terms for whatever it does not. */
  readonly capabilities: SpecCapabilities;
  /** Applied when a cabinet of this type doesn't specify them. */
  readonly defaultOptions: CabinetOptions;
  /**
   * False for a type that is not a box at all — an appliance space. Defaults to true, which is
   * every spec that existed before one did.
   *
   * It governs whether `validateContext`'s carcass checks run. Those ask whether an interior
   * opening survives the sides and the horizontals, which is a good question about a cupboard and
   * a meaningless one about a gap where a dishwasher goes: a 600mm space would be told its width
   * is "too narrow for 16mm sides" it does not have.
   */
  readonly isCarcass?: boolean;
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

/**
 * Which face of a panel looks toward the given cabinet-space direction, or null for the four
 * directions that are edges rather than faces.
 *
 * The mirror image of `edgeFacing`, and it exists for the same reason: "cut a groove in the face
 * that looks into the cabinet" is the actual instruction, and whether that is the A face or the
 * B face depends on the placement — `w = u × v` is derived, so a left side and a right side get
 * opposite answers from the same sentence. Asking the placement is what makes a handed pair come
 * out as a handed pair. See `model/partFeature.ts`.
 */
export const faceFacing = (p: PanelPlacement, direction: SignedAxis): MachiningFace | null => {
  const w = placementNormal(p);
  if (direction === w) return 'A';
  if (direction === negateAxis(w)) return 'B';
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
