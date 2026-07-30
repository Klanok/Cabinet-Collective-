/**
 * Run units — the things that span a run of cabinets and belong to none of them.
 *
 * There are two: a benchtop and a ladder base. They are siblings rather than a coincidence, and
 * this file holds what they genuinely share, which is *how they are owned*.
 *
 * ## This deliberately breaks the rule that derived things are never stored
 *
 * Everywhere else in this codebase, a part is regenerated from its cabinet on every build and
 * never written back — that is what stops a saved job carrying stale geometry. A run unit is the
 * exception, and it earns it:
 *
 * A panel is derived from a cabinet **every time** because nothing else decides it. A benchtop
 * *stops* being derived the moment somebody sets a 40mm overhang on one end, mitres a corner, or
 * puts the sink 300mm off centre. None of that follows from the cabinets, and none of it can be
 * worked out from them. The alternative was keying those overrides on a run identity — but a run
 * identity changes the moment a cabinet moves, so the overhang you set last week would silently
 * detach from the top you set it on.
 *
 * So: **generated once, then owned.** The run finder in `project/runs.ts` is the generator, and
 * `fromCabinetIds` is a record of where it came from. Nothing but "regenerate" reads that field,
 * and nothing should start to: the moment something else does, moving a cabinet starts moving a
 * benchtop again and the ownership is a fiction.
 */

import type { Mm } from '../units.ts';
import type { CabinetPlacement } from '../geom/placement.ts';

/** What a run unit is. Both are stored on the project in their own list. */
export type RunUnitKind = 'benchtop' | 'kick-base';

export interface RunUnit {
  readonly id: string;
  /** Label shown in the UI and on the cutlist — "Top 1", "Plinth — south wall". */
  readonly name: string;
  /**
   * The cabinets this was generated from.
   *
   * **For "regenerate" and nothing else.** It is not a dependency and must never be read as one.
   * A cabinet listed here may since have been deleted, moved or resized, and the unit is still
   * exactly where its owner put it — which is the point.
   */
  readonly fromCabinetIds: readonly string[];
  /**
   * Where it stands, in the same terms a cabinet does: an anchor and a yaw.
   *
   * A run unit gets a local frame that behaves exactly like cabinet space — origin at the
   * back-left corner, +X along the run, +Y up, +Z towards the front — so the transform chain, the
   * viewport and the CSV exports all keep working unchanged. The anchor's Y is the unit's own
   * datum: for a benchtop the **underside** of the slab, for a ladder base the **floor**.
   */
  readonly placement: CabinetPlacement;
  /** Length of the run itself, before any end overhang the unit adds. */
  readonly length: Mm;
  /**
   * Depth of the deepest cabinet in the run, before any overhang or setback the unit applies.
   *
   * Generated, not owned: it is a fact about the carcasses. What the unit *does* with it — a
   * 20mm front overhang on a top, a 50mm setback on a plinth — is the unit's own business and
   * survives a regenerate.
   */
  readonly carcassDepth: Mm;
}

/**
 * Carry an owner's edits across a regenerate.
 *
 * Regenerating means "the cabinets moved; put the unit back over them". It must not mean "throw
 * away the sink". So the geometry the run finder produces wins, and everything a person set is
 * kept — which is the whole distinction this module exists to draw.
 */
export const regenerated = <T extends RunUnit>(existing: T, fresh: T): T => ({
  ...existing,
  fromCabinetIds: fresh.fromCabinetIds,
  placement: fresh.placement,
  length: fresh.length,
  carcassDepth: fresh.carcassDepth,
});
