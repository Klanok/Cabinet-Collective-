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
 * **The cushion is measured off the finished front face, and stands proud of it.** That is the
 * §5.14 correction and it replaces the opposite rule: the cushion used to be held *inside* every
 * carcass face by `seatCushionInset`, so you looked down onto a strip of white carcass all the way
 * round it — reported from the bench as *"standard straight run cushion is exposing the carcass"*.
 * The shop's answer:
 *
 * > *"it should be adjustable — but generally should be 10mm proud of the finish panel/door"*
 *
 * **Proud at the front; flush at the ends and the back.** Only the front carries the overhang,
 * and the reason each of the other three does not is a physical one rather than a simplification:
 *
 * - **The back** goes against a wall. A cushion standing proud there is a cushion the wall pushes
 *   forward.
 * - **The ends** butt the next unit in the run. Two cushions each 10mm proud of their own end
 *   overlap by 20, and a run of banquettes is the normal case rather than the exception.
 * - **A finished end does not change that**, and this codebase already says so: `banquette.ts`
 *   describes an applied end's top edge as sitting *"at seat height with a cushion beside it"*.
 *   Beside, not under.
 *
 * ## The rounded corner falls out, rather than needing a rule of its own
 *
 * Front proud by `o` and end flush would look like two edges that cannot be joined. They join
 * exactly: the cushion's fillet is the **same radius** as the carcass arc with its centre moved
 * forward by `o`. That arc is tangent to the cushion's own front edge (`z1`) and to the cabinet's
 * end face, so the overhang eases from `o` at the front tangent to nothing at the end tangent —
 * which is what a soft corner does. One arc, one radius, no second number to keep in step.
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
  /**
   * Cabinet-space z of the finished front face — the front of the fixed front panel, which is
   * `RuleContext.finishedFrontZ`.
   *
   * **Passed in rather than derived from `D`.** The overhang is stated against *the finish panel*,
   * and how far that stands in front of the carcass is the construction method's business: a
   * standoff plus a board, both of which a shop can change. Working it out here would be a second
   * opinion about where the front of the kitchen is, and the one that goes stale.
   */
  readonly finishedFrontZ: Mm;
  /** How far the cushion stands proud of that finished front. Shipped at the shop's 10mm. */
  readonly overhang: Mm;
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
  const overhang = mm(Math.max(0, input.overhang));
  // Flush at both ends and at the back; proud of the finished front by the overhang.
  const x0 = mm(0);
  const x1 = input.W;
  const z0 = mm(0);
  const z1 = mm(input.finishedFrontZ + overhang);
  const width = mm(Math.max(0, x1 - x0));
  const depth = mm(Math.max(0, z1 - z0));

  const full = { left: depth, right: depth };
  if (!input.round || input.round.radius <= 0) {
    return { x0, x1, z0, z1, width, depth, round: null, endRun: full };
  }

  /*
   * **The cushion's radius is the carcass's radius, unchanged**, and that is the whole of the
   * corner. Front proud and end flush is one arc of radius `r` whose centre has moved forward by
   * the overhang: still tangent to the cushion's front edge at `z1`, still tangent to the
   * cabinet's end face. It used to be `r − inset`, which was right for a cushion held inside
   * every face and is wrong for one that is only held off the front.
   *
   * Never more than the cushion has room to turn — a rounded corner needs its radius to fit
   * within the rectangle on both axes, and at the limit the cushion is a quarter disc.
   *
   * Clamped rather than reported: this is a soft part in a picture, and a radius the cabinet
   * cannot turn has already been reported against the carcass, in the warnings, in millimetres.
   */
  const radius = mm(Math.min(input.round.radius, width, depth));
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
 *
 * **It goes flush and takes no overhang, and that is deliberate rather than an omission.** The
 * disc's arc is its front, but its two straight edges are radii of the same circle: grow the
 * radius to push the arc 10mm into the room and both straight edges grow with it, 10mm into the
 * banquette either side. So "10mm proud of the finish panel" has no meaning on this outline — and
 * §5.13 item 1 says this outline is wrong in kind anyway. It is an **L with a small concave
 * fillet**, not a quarter disc, and the overhang is worth stating once against the shape the shop
 * actually described rather than twice against one that is on its way out.
 *
 * Going flush still closes the reported fault here: the old inset held the disc 5mm inside the
 * carcass all round, so the corner unit exposed carcass exactly as the straight run did.
 */
export const cornerSeatRadius = (W: Mm, D: Mm): Mm => mm(Math.max(MIN_CUSHION, Math.min(W, D)));

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
 * upholsterer makes and measures the cushion. Now that the cushion runs flush to both ends that is
 * the cabinet's width as well — 1200 on a 1200 unit, where the 5mm inset used to make it 1190. The
 * charge follows the cushion, and the cushion got bigger; see §5.14 for the re-price.
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
