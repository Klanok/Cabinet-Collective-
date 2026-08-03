/**
 * The plan shape of a banquette's cushions.
 *
 * **Why this is in `core` and not in the viewport.** A cushion is not a `Panel` — nothing cuts
 * it, nests it or bores it, and §5.4 records that it is not costed either. But its *shape* is
 * arithmetic, and the §7 standard is that arithmetic gets asserted rather than looked at: the
 * seat that sat 25mm proud of its own lid was found by measuring, not by looking, and the
 * cushion that ignored a 200mm corner radius would have looked like a slightly boxy cushion.
 * So the shape is worked out here, where a test in Node can read it, and the viewport extrudes
 * what it is given.
 *
 * **The cushion is measured off the carcass, not off the finished front face.** That is how it
 * has always been drawn — inset from `width` and `depth` — and it is left that way deliberately:
 * moving the cushion forward onto the door plane is a separate question about how far a seat
 * overhangs its front, which nobody has been asked. What follows from it is that the cushion's
 * rounded corner is concentric with the carcass corner in x and sits back from the cabinet's own
 * arc in z by exactly the amount the whole cushion already sits back. It is one soft object with
 * one radius, not two arcs that have to agree to a tenth.
 */

import { type Mm, mm } from '../units.ts';

export type CushionCorner = 'front-left' | 'front-right';

/** A rounded plan corner: which one, and the radius it turns. */
export interface CushionRound {
  readonly corner: CushionCorner;
  readonly radius: Mm;
}

export interface SeatCushionPlan {
  /** Plan rectangle of the seat, in cabinet space. */
  readonly x0: Mm;
  readonly x1: Mm;
  readonly z0: Mm;
  readonly z1: Mm;
  readonly width: Mm;
  readonly depth: Mm;
  /** The rounded front corner, or `null` for a square cushion — which is the usual case. */
  readonly round: CushionRound | null;
  /**
   * How far forward of `z0` a back cushion returning down each end may run.
   *
   * The full seat depth on a square end. On the radiused end it stops at the tangent, because
   * past that point the seat is turning away underneath it and a straight bolster would hang
   * over the curve in mid-air.
   */
  readonly endRun: { readonly left: Mm; readonly right: Mm };
}

export interface SeatCushionInput {
  readonly W: Mm;
  readonly D: Mm;
  /** How far the cushion is held in from every face of the carcass. */
  readonly inset: Mm;
  /**
   * The cabinet's **resolved** finished corner radius, or null.
   *
   * Resolved, not asked for: a radius the bendy ply cannot turn comes back null from the rule
   * engine and the carcass is built square, so a cushion drawn from the raw option would put a
   * curve on a square box. The one number both read is the one the engine settled on.
   */
  readonly round: CushionRound | null;
}

export const seatCushionPlan = (input: SeatCushionInput): SeatCushionPlan => {
  const inset = mm(Math.max(0, input.inset));
  const x0 = inset;
  const x1 = mm(input.W - inset);
  const z0 = inset;
  const z1 = mm(input.D - inset);
  const width = mm(Math.max(0, x1 - x0));
  const depth = mm(Math.max(0, z1 - z0));

  const full = { left: depth, right: depth };
  if (!input.round || input.round.radius <= 0) {
    return { x0, x1, z0, z1, width, depth, round: null, endRun: full };
  }

  /*
   * The cushion's own radius, held in from the finished curve by the same inset as the rest of
   * it, and never more than the cushion has room to turn — a rounded corner needs its radius to
   * fit within the rectangle on both axes, and at the limit the cushion is a quarter disc.
   *
   * Clamped rather than reported: this is a soft part in a picture, and a radius the cabinet
   * cannot turn has already been reported against the carcass, in the warnings, in millimetres.
   */
  const radius = mm(Math.min(input.round.radius - inset, width, depth));
  if (radius <= 0) return { x0, x1, z0, z1, width, depth, round: null, endRun: full };

  const round = { corner: input.round.corner, radius };
  // The bolster on the radiused end stops where the arc springs; the other end keeps the lot.
  const run = mm(Math.max(0, depth - radius));
  return {
    x0,
    x1,
    z0,
    z1,
    width,
    depth,
    round,
    endRun:
      round.corner === 'front-right' ? { left: depth, right: run } : { left: run, right: depth },
  };
};
