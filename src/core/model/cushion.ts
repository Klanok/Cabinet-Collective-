/**
 * The plan shape of a banquette's cushions, and the lineal metres they are charged by.
 *
 * **Why this is in `core` and not in the viewport.** A cushion is not a `Panel` — nothing cuts
 * it, nests it or bores it. But its *shape* is
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
 *
 * ## The lineal metres are here for a sharper reason
 *
 * Cushions are **bought in as finished units** and charged by the lineal metre of each piece, so
 * how long a cushion is has stopped being a drawing question and become a price. The viewport was
 * already working those lengths out inline, to decide how wide to draw a bolster. Costing needs the
 * identical numbers, and two descriptions would mean **a cushion you can see and a cushion you are
 * charged for could be different lengths** — with nothing on screen looking wrong. So the lengths
 * live here, once, and both read them.
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

/* ── What gets charged ──────────────────────────────────────────────────────────────────────── */

/**
 * One cushion the upholsterer makes.
 *
 * Three kinds because the shop names three — *"the base and separately to the back or any
 * returns"* — and each is a separate physical cushion at its own lineal charge.
 */
export type CushionKind = 'seat' | 'back' | 'return';

export interface CushionPiece {
  readonly kind: CushionKind;
  /** What it is called on the order — "Seat", "Back", "Left return". */
  readonly label: string;
  /** How long the upholsterer measures it, along the run. */
  readonly linealMm: Mm;
}

/**
 * The smallest cushion worth drawing or charging.
 *
 * The viewport has always floored a bolster at 50mm so a degenerate one does not render as a
 * sliver. The same floor applies here rather than a different one, because a cushion charged at a
 * length it is not drawn at is exactly the disagreement this module exists to prevent.
 */
const MIN_CUSHION: Mm = mm(50);

/**
 * How far a return bolster runs, measured forward from the back cushion.
 *
 * `endRun` is the full seat depth on a square end and stops at the tangent on a radiused one —
 * past the tangent the seat is turning away underneath and a straight bolster would hang over the
 * curve in mid-air. The back cushion's own thickness comes off, because the return starts in front
 * of it rather than inside it.
 */
export const returnRun = (
  plan: SeatCushionPlan,
  end: 'left' | 'right',
  backThickness: Mm,
): Mm => mm(Math.max(MIN_CUSHION, Math.min(plan.depth, plan.endRun[end]) - backThickness));

/**
 * The radius of a corner unit's quarter-disc seat.
 *
 * Its own function because the corner unit's cushion is not `seatCushionPlan` — that describes a
 * rectangle with at most one rounded corner, and this is a quarter circle. Both the mesh and the
 * charge need the one number.
 */
export const cornerSeatRadius = (W: Mm, D: Mm, inset: Mm): Mm =>
  mm(Math.max(MIN_CUSHION, Math.min(W, D) - Math.max(0, inset)));

export interface CushionPiecesInput {
  readonly plan: SeatCushionPlan;
  readonly hasBackCushion: boolean;
  readonly backCushionThickness: Mm;
  readonly leftEndCushion: boolean;
  readonly rightEndCushion: boolean;
}

/**
 * Every cushion on a plain banquette, in the order an order would list them.
 *
 * **The seat and the back are both charged at the cushion's own width**, not the cabinet's: the
 * upholsterer makes and measures the cushion, which is held in from the carcass by the inset. On a
 * 1200 cabinet at the shipped 5mm inset that is 1190, and the difference is 20mm of nobody's money.
 *
 * **A rounded front corner does not lengthen the seat.** The cushion still spans the same distance
 * along the run; what changes is the shape of one corner of it. Charging the longer front edge
 * would be reading "lineal metre" as "perimeter", which is not how a run of seating is measured.
 */
export const cushionPieces = (input: CushionPiecesInput): readonly CushionPiece[] => {
  const width = mm(Math.max(MIN_CUSHION, input.plan.width));
  const pieces: CushionPiece[] = [{ kind: 'seat', label: 'Seat', linealMm: width }];
  if (!input.hasBackCushion) return pieces;

  pieces.push({ kind: 'back', label: 'Back', linealMm: width });
  if (input.leftEndCushion) {
    pieces.push({
      kind: 'return',
      label: 'Left return',
      linealMm: returnRun(input.plan, 'left', input.backCushionThickness),
    });
  }
  if (input.rightEndCushion) {
    pieces.push({
      kind: 'return',
      label: 'Right return',
      linealMm: returnRun(input.plan, 'right', input.backCushionThickness),
    });
  }
  return pieces;
};

/**
 * Every cushion on the quarter-circle corner unit.
 *
 * **The seat is charged along its arc**, and that is a decision rather than an obvious reading. A
 * lineal metre of seating is measured along the front of the run, and the front of this piece *is*
 * the curve — so a 500mm corner is charged at 785mm, not at 500. The alternative readings are one
 * leg (which charges a corner less than the straight metre either side of it, for more work) or
 * both legs (which charges the same seat twice).
 *
 * **It is a reading, and it is on the unchecked list** — see §3. Nobody has put a corner unit to
 * the upholsterer.
 *
 * The two backs run along the two straight edges and are each one radius long, which needs no
 * interpretation.
 */
export const cornerCushionPieces = (
  radius: Mm,
  hasBackCushion: boolean,
): readonly CushionPiece[] => {
  const pieces: CushionPiece[] = [
    { kind: 'seat', label: 'Corner seat', linealMm: mm((radius * Math.PI) / 2) },
  ];
  if (!hasBackCushion) return pieces;
  pieces.push({ kind: 'back', label: 'Back — along the first run', linealMm: radius });
  pieces.push({ kind: 'back', label: 'Back — along the second run', linealMm: radius });
  return pieces;
};
