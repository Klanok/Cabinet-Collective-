/**
 * A ladder base — a frame standing on the floor that a run of cabinets sits on, with the kick face
 * applied to the front of it.
 *
 * The alternative, and what this codebase had until now, is a kick panel per cabinet. Both are
 * real ways to build a kitchen and `CabinetOptions.hasKick` has always been the switch between
 * them — it just had nothing to defer to. This is the thing it defers to.
 *
 * ## Why it is built the way it is
 *
 * As specified from the bench, and each of the three is a working decision rather than a detail:
 *
 * - **The ribs run to the floor.** They are the full kick height, and they are what the whole
 *   thing stands and gets levelled on. Everything else hangs off them.
 * - **The rails are cut short**, so they hang clear of the floor and the frame beds down on the
 *   ribs alone. On a floor that is never flat, that is the difference between packing three ribs
 *   and fighting a rail that rocks.
 * - **The face is cut over-height**, left long to be planed in on site.
 *
 * ## The figure that is not confirmed
 *
 * Which *end* of the face the extra sits at is a reading, not a fact: the note said "cut 10mm
 * higher", and the sensible interpretation is that it is a scribe allowance at the **floor**. It
 * ships as `floor` and it is listed by name as unconfirmed everywhere the app can say so, because
 * cutting it at the wrong end is a whole run of kick faces.
 *
 * The four numbers behind all of this live on the **construction method**, beside the kick height
 * and the kick setback, because they are conventions a shop builds to rather than something the
 * geometry can work out. See `model/construction.ts`.
 */

import type { Mm } from '../units.ts';
import type { RunUnit } from './runUnit.ts';

export interface KickBase extends RunUnit {
  /**
   * Height of the frame — floor to the underside of the carcasses.
   *
   * Its own field rather than read back off the construction method's `kickHeight`, because the
   * frame has to match the cabinets *actually sitting on it*, and those were placed at whatever
   * height they were placed at. Generated from the run, then owned.
   */
  readonly height: Mm;
  /**
   * Front-to-back size of the frame. Generated as the carcass depth less the kick setback, so the
   * face lands where a per-cabinet kick's face would.
   */
  readonly depth: Mm;
  /** Sheet the frame is cut from. Unset follows the job's carcass board. */
  readonly frameMaterialId?: string;
  /** Sheet the visible face is cut from. Unset follows the job's door board. */
  readonly faceMaterialId?: string;
  /** False for a frame that is getting a separate applied kick, or none. */
  readonly hasFace: boolean;
  /**
   * Greatest clear gap between ribs. Unset follows the construction method.
   *
   * Per-unit rather than per-job because it is a load question: a run under a stone top and a run
   * under a laminate one are not carrying the same thing.
   */
  readonly maxRibGap?: Mm;
}

/**
 * How many ribs, and where their centres sit along the frame.
 *
 * One at each end and then as few as will keep every clear gap inside the limit. The ends are
 * flush with the ends of the frame — the rails run past nothing — so the first and last rib
 * centres sit half a thickness in.
 *
 * Evenly spaced rather than seeded from where the cabinets meet, and that is deliberate: the
 * frame is **owned**, so it must not start reading the cabinets again the moment somebody moves
 * one. A rib landing under a carcass join is a happy accident, not a rule.
 */
export const ribPositions = (length: Mm, thickness: Mm, maxGap: Mm): readonly Mm[] => {
  const span = length - thickness;
  if (span <= 0) return [thickness / 2];
  // Gaps between rib faces, so the count follows the clear opening rather than the centres.
  const gapCount = Math.max(1, Math.ceil((length - thickness) / Math.max(1, maxGap + thickness)));
  const step = span / gapCount;
  return Array.from({ length: gapCount + 1 }, (_, i) => thickness / 2 + i * step);
};

/** Clear gap left between two ribs at the given spacing. */
export const clearRibGap = (positions: readonly Mm[], thickness: Mm): Mm => {
  if (positions.length < 2) return 0;
  return positions[1]! - positions[0]! - thickness;
};
