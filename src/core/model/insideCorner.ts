/**
 * The plan of an inside banquette corner — the seat that turns a corner between two walls.
 *
 * ## What it is, in the shop's own words
 *
 * > *"essentially it wont be 500 x 500 — it could be 900 x 900 along the back wall with 500mm depth
 * > to both. In this scenario you could have an internal radius of 150mm or so."*
 *
 * **The seat is an L, and the radius is a small fillet on its inside corner.** Two walls meet; the
 * unit spans some length along each; the seat is a run's depth off each wall. So the plan is the
 * union of two rectangles sharing the square in the back corner. The far corner of the overall
 * footprint is a full span from both walls, which is bed depth rather than seat depth, and is not
 * seat at all.
 *
 * That leaves exactly one corner where the two seat fronts meet, pointing into the room, and the
 * fillet rounds it off tangent to both. Hence *"internal radius"*, and hence a figure with nothing
 * to do with the unit's size.
 *
 * **This replaces a quarter disc, and it was wrong in kind rather than in detail.** The old unit
 * built a convex quarter bulging into the room, off a `validate` rule insisting
 * `width = depth = insideCornerRadius`. The shop's verdict on it was *"a complete mess"*. It had
 * also been **mis-derived twice from that one sentence** before the description above was written
 * down, which is why the outline now lives in one function that the parts, the picture and the
 * price all read, rather than being rebuilt by each.
 *
 * ## The one thing worth measuring rather than reasoning about
 *
 * **Filleting the inside corner makes the seat *bigger*, not smaller.** The corner is a reflex
 * vertex — 270° of seat around a point — so rounding it cuts the corner off the **void**, not off
 * the solid. On the shop's own example the plan goes from 650,000mm² to **654,828.5mm²**, up by
 * `r² − πr²/4`. Reasoning about it produced the opposite answer twice over; the assertion in
 * `tests/insideCorner.test.ts` is what settles it, and it is worth keeping the number in front of
 * anyone who edits this.
 *
 * The physical check that says the same thing: a sharp 270° corner of bench is what somebody
 * catches their hip on. Rounding it makes the seat fuller there, not emptier.
 *
 * ## The frame
 *
 * Cabinet space, matching what the unit already used so no placement has to be re-taught:
 *
 * ```
 *   wall A   the z = 0 plane, running along +x     the unit spans `W` of it
 *   wall B   the x = 0 plane, running along +z     the unit spans `D` of it
 *   room     +x, +z                                the seat is `seatDepth` off each wall
 * ```
 *
 * `depth` therefore means *span along the second wall* on this one cabinet, not depth off a wall —
 * which is what the shop's "900 × 900" is, and what the old unit's `W = D = radius` already meant.
 * Seat depth is its own field because it is its own number: one figure, both legs.
 */

import { type Mm, mm } from '../units.ts';
import type { PlanRing } from '../rules/radius.ts';
import { type Vec2, v2 } from '../geom/vec.ts';

/**
 * The bulge of the fillet, on the vertex it leaves.
 *
 * **Negative, and the sign is the whole thing.** The outline below is wound counter-clockwise, and
 * on a counter-clockwise boundary a positive bulge is convex — material bulging out. This corner
 * curves the other way: the seat wraps *around* a centre that is out in the room. Positive here is
 * the quarter disc that was reported as a complete mess, at a fifteenth of its size, which would
 * look like a detail rather than a fault.
 *
 * `tan(90° / 4)` is a quarter turn; see `docs` on `geom/arc.ts` for why one number is the whole arc.
 */
const FILLET_BULGE = -Math.tan(Math.PI / 8);

export interface InsideCornerInput {
  /** Span along wall A, the z = 0 wall. */
  readonly W: Mm;
  /** Span along wall B, the x = 0 wall. */
  readonly D: Mm;
  /** How far the seat comes off **each** wall. One figure, both legs — the shop's own. */
  readonly seatDepth: Mm;
  /** The fillet where the two seat fronts meet. */
  readonly radius: Mm;
  /**
   * How far the finished face stands in front of the carcass — a standoff plus a front's board,
   * `ctx.finishedFrontZ − seatDepth`.
   *
   * Absent means zero, which is the carcass ring itself and is what a test measuring the plain L
   * wants. **It is not optional in a real build**: the wrap has to finish in the same plane as the
   * fronts of the banquettes either side of it, or the connector steps where it joins them.
   */
  readonly frontProud?: Mm;
}

export interface InsideCornerPlan {
  /** Span along wall A, the z = 0 wall. */
  readonly W: Mm;
  /** Span along wall B, the x = 0 wall. */
  readonly D: Mm;
  /** Carcass depth off each wall, after clamping. The same figure a banquette's `depth` is. */
  readonly seatDepth: Mm;
  /** Where the finished face lands: `seatDepth + frontProud`. */
  readonly finishedFront: Mm;
  /** The fillet actually built, measured on the **finished** face. Zero is a square inside corner. */
  readonly radius: Mm;
  /**
   * The finished seat outline in cabinet space, wound counter-clockwise, with the fillet as a bulge.
   *
   * One description, read by the wrap, the cushion and the charge; the carcass rings come off the
   * same centre through `insideCornerRingAt`. The old unit had `quarterRing` in the spec and a
   * second quarter in the viewport, which is the two-descriptions fault this codebase keeps paying
   * for — and this unit is the one where nobody can check the answer against a cutlist.
   */
  readonly outline: PlanRing;
  /** The finished front of the leg running along wall A: the plane z = finishedFront. */
  readonly frontA: { readonly z: Mm; readonly x0: Mm; readonly x1: Mm };
  /** The finished front of the leg running along wall B: the plane x = finishedFront. */
  readonly frontB: { readonly x: Mm; readonly z0: Mm; readonly z1: Mm };
  /** Where the fillet leaves front A, and where it meets front B — on the finished face. */
  readonly tangentA: Vec2;
  readonly tangentB: Vec2;
  /** The fillet's centre — **out in the room**, which is what makes it an inside corner. */
  readonly filletCentre: Vec2;
}

/**
 * The largest fillet this unit has room for.
 *
 * The fillet is tangent `radius` along each leg from the corner, so it needs that much leg to be
 * tangent to. A radius past it puts the tangent point beyond the open end of a leg, where there is
 * no front for it to be tangent to and the outline crosses itself. Clamped rather than refused,
 * because the carcass warnings are where an impossible figure gets reported in millimetres — and a
 * number field fires on every keystroke, so typing "150" asks for 1 and then 15 on the way.
 */
export const maxInsideCornerRadius = (input: {
  readonly W: Mm;
  readonly D: Mm;
  readonly seatDepth: Mm;
}): Mm => mm(Math.max(0, Math.min(input.W, input.D) - input.seatDepth));

/**
 * The plan ring of any surface parallel to the finished front, `d` behind it.
 *
 * **One centre, and every layer is a radius.** That is the whole of the build-up on this unit, and
 * it is worth stating as a rule rather than as three separate derivations — the alternative works
 * out the carcass ring, the former ring and each ply layer from their own arithmetic, which is
 * three chances to put one of them a millimetre out of plane with the other two, on the one face
 * somebody's hand runs along.
 *
 * A surface `d` behind the finished face has its straight fronts at `F − d` and its fillet at
 * `r + d`, **about the same centre**, because the centre is out in the room and going backwards is
 * going further from it. Tangency falls out rather than being arranged:
 * `centre − (r + d) = (F + r) − (r + d) = F − d`.
 *
 * **The sign is the one thing that inverts from §4.5's convex corner**, where a substrate is
 * `r − skin`. Here it is `r + d`. Getting it backwards puts the curve two skins out of plane with
 * the two runs of front it flows into, which is a step exactly where a hand lands.
 */
export const insideCornerRingAt = (plan: InsideCornerPlan, d: Mm): PlanRing => {
  const f = mm(plan.finishedFront - d);
  if (f <= 0) return [];
  if (plan.radius <= 0) {
    return [
      { x: mm(0), z: mm(0) },
      { x: plan.W, z: mm(0) },
      { x: plan.W, z: f },
      { x: f, z: f },
      { x: f, z: plan.D },
      { x: mm(0), z: plan.D },
    ];
  }
  return [
    { x: mm(0), z: mm(0) },
    { x: plan.W, z: mm(0) },
    { x: plan.W, z: f },
    { x: plan.filletCentre.x, z: f, bulge: FILLET_BULGE },
    { x: f, z: plan.filletCentre.y },
    { x: f, z: plan.D },
    { x: mm(0), z: plan.D },
  ].filter((v) => v.x <= plan.W + SLOP && v.z <= plan.D + SLOP) as PlanRing;
};

/** Tolerance for "still on the unit" when a ring is taken well behind the finished face. */
const SLOP = 1e-6;

export const insideCornerPlan = (input: InsideCornerInput): InsideCornerPlan => {
  const sd = mm(Math.max(0, Math.min(input.seatDepth, input.W, input.D)));
  const proud = mm(Math.max(0, input.frontProud ?? 0));
  const finishedFront = mm(sd + proud);
  const r = mm(
    Math.max(0, Math.min(input.radius, maxInsideCornerRadius({ ...input, seatDepth: finishedFront }))),
  );

  const tangentA = v2(mm(finishedFront + r), finishedFront);
  const tangentB = v2(finishedFront, mm(finishedFront + r));
  const filletCentre = v2(mm(finishedFront + r), mm(finishedFront + r));

  const plan: InsideCornerPlan = {
    W: input.W,
    D: input.D,
    seatDepth: sd,
    finishedFront,
    radius: r,
    outline: [],
    frontA: { z: finishedFront, x0: tangentA.x, x1: input.W },
    frontB: { x: finishedFront, z0: tangentB.y, z1: input.D },
    tangentA,
    tangentB,
    filletCentre,
  };
  return { ...plan, outline: insideCornerRingAt(plan, mm(0)) };
};

/**
 * How the upholsterer measures the seat of a corner unit.
 *
 * **Two straight fronts plus the fillet, measured along the front edge.** §4.19 settled that a
 * lineal metre of seating is measured along the front of the run, and argued that reading against
 * the two alternatives — one leg, which charges a corner less than the straight metre either side
 * of it for more work, and both legs, which charges the same seat twice. **That reading survives;
 * the shape it measures does not.** The old unit had one long convex arc, `radius × π/2`, and this
 * has two straight runs and a short concave one.
 *
 * Still **on the unchecked list** (§3): nobody has put a corner unit to the upholsterer. What has
 * changed is that the figure is now measured along a front that exists.
 */
export const insideCornerSeatLineal = (plan: InsideCornerPlan): Mm =>
  mm(
    Math.max(0, plan.frontA.x1 - plan.frontA.x0) +
      Math.max(0, plan.frontB.z1 - plan.frontB.z0) +
      (plan.radius * Math.PI) / 2,
  );
