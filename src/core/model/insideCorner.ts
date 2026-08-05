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
import type { Polygon } from '../geom/profile.ts';
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
}

export interface InsideCornerPlan {
  readonly seatDepth: Mm;
  /** The fillet actually built, after clamping. Zero means a square inside corner. */
  readonly radius: Mm;
  /**
   * The seat's plan outline in cabinet space, wound counter-clockwise, with the fillet as a bulge.
   *
   * One description, read by the bottom, the lift-up, the cushion and the charge. The old unit had
   * `quarterRing` in the spec and a second quarter in the viewport, which is the two-descriptions
   * fault this codebase keeps paying for.
   */
  readonly outline: Polygon;
  /** The front face of the leg running along wall A: the plane z = seatDepth. */
  readonly frontA: { readonly z: Mm; readonly x0: Mm; readonly x1: Mm };
  /** The front face of the leg running along wall B: the plane x = seatDepth. */
  readonly frontB: { readonly x: Mm; readonly z0: Mm; readonly z1: Mm };
  /** Where the fillet leaves front A, and where it meets front B. */
  readonly tangentA: Vec2;
  readonly tangentB: Vec2;
  /** The fillet's centre — **out in the room**, which is what makes it an inside corner. */
  readonly filletCentre: Vec2;
}

/**
 * The largest fillet this unit has room for.
 *
 * The fillet is tangent at `seatDepth + r` along each leg, so it needs that much leg to be tangent
 * to. A radius past it would put the tangent point beyond the open end of a leg, where there is no
 * front for it to be tangent to and the outline crosses itself. Clamped rather than refused,
 * because the carcass warnings are where an impossible figure gets reported in millimetres — and a
 * number field fires on every keystroke, so typing "150" asks for 1 and then 15 on the way.
 */
export const maxInsideCornerRadius = (input: {
  readonly W: Mm;
  readonly D: Mm;
  readonly seatDepth: Mm;
}): Mm => mm(Math.max(0, Math.min(input.W, input.D) - input.seatDepth));

export const insideCornerPlan = (input: InsideCornerInput): InsideCornerPlan => {
  const sd = mm(Math.max(0, Math.min(input.seatDepth, input.W, input.D)));
  const r = mm(Math.max(0, Math.min(input.radius, maxInsideCornerRadius({ ...input, seatDepth: sd }))));

  const tangentA = v2(mm(sd + r), sd);
  const tangentB = v2(sd, mm(sd + r));
  const filletCentre = v2(mm(sd + r), mm(sd + r));

  /*
   * Counter-clockwise from the corner where the two walls meet:
   *
   *   (0, 0) → (W, 0)          along wall A, the back of the first leg
   *   (W, 0) → (W, sd)         the open end of the first leg, butting the next banquette
   *   (W, sd) → tangentA       the front of the first leg, running back toward the corner
   *   tangentA ⌒ tangentB      the fillet
   *   tangentB → (sd, D)       the front of the second leg, running away from wall A
   *   (sd, D) → (0, D)         the open end of the second leg
   *   (0, D) → (0, 0)          along wall B
   *
   * At r = 0 the two tangent points collapse onto the reflex corner itself and the bulge sits on a
   * zero-length edge, so the shape is the plain square-cornered L with no special case for it.
   */
  const outline: Polygon =
    r > 0
      ? [
          v2(mm(0), mm(0)),
          v2(input.W, mm(0)),
          v2(input.W, sd),
          { x: tangentA.x, y: tangentA.y, bulge: FILLET_BULGE },
          v2(tangentB.x, tangentB.y),
          v2(sd, input.D),
          v2(mm(0), input.D),
        ]
      : [
          v2(mm(0), mm(0)),
          v2(input.W, mm(0)),
          v2(input.W, sd),
          v2(sd, sd),
          v2(sd, input.D),
          v2(mm(0), input.D),
        ];

  return {
    seatDepth: sd,
    radius: r,
    outline,
    frontA: { z: sd, x0: mm(sd + r), x1: input.W },
    frontB: { x: sd, z0: mm(sd + r), z1: input.D },
    tangentA,
    tangentB,
    filletCentre,
  };
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
export const insideCornerSeatLineal = (plan: InsideCornerPlan, W: Mm, D: Mm): Mm =>
  mm(
    Math.max(0, W - plan.frontA.x0) +
      Math.max(0, D - plan.frontB.z0) +
      (plan.radius * Math.PI) / 2,
  );
