/**
 * The inside banquette corner — the shape, worked longhand.
 *
 * ## The shop's own example
 *
 * > *"essentially it wont be 500 x 500 — it could be 900 x 900 along the back wall with 500mm depth
 * > to both. In this scenario you could have an internal radius of 150mm or so."*
 *
 * ```
 *   spans          W = 900 along wall A (z = 0),  D = 900 along wall B (x = 0)
 *   seat depth     500 off each wall — one figure, both legs
 *   fillet         150 where the two seat fronts meet
 *
 *   leg A          x 0 → 900,  z 0 → 500
 *   leg B          x 0 → 500,  z 0 → 900
 *   shared square  500 × 500 in the back corner
 *   plain L        900×500 + 500×900 − 500×500              = 650,000 mm²
 *   fillet adds    r² − πr²/4 = 22,500 − 17,671.46          =   4,828.54
 *   plan area                                                = 654,828.54 mm²
 *
 *   tangent A      (500 + 150, 500)                          = (650, 500)
 *   tangent B      (500, 500 + 150)                          = (500, 650)
 *   fillet centre  (650, 650)                                — out in the room
 * ```
 *
 * ## The one that has to be measured rather than reasoned about
 *
 * **The fillet makes the seat bigger.** The corner where the two fronts meet is a *reflex* vertex —
 * 270° of seat around a point — so rounding it cuts the corner off the **void**, not off the solid.
 * Working it out on paper gave the opposite answer, twice, in two different ways; this file is what
 * settles it. If a change here makes the area come out at **645,171.46** the fillet has been put on
 * the wrong side, which is a 9,657mm² error that looks entirely plausible in a screenshot.
 *
 * The physical version of the same check: a sharp 270° corner of bench is what somebody catches
 * their hip on, and rounding it makes the seat fuller there rather than emptier.
 *
 * ## And the one that has to be asserted as a position, not a size
 *
 * The old unit was a convex quarter disc bulging into the room, and the shop's verdict was *"a
 * complete mess"*. A fillet of the right radius on the wrong side is the same radius, the same arc
 * length and nearly the same bounding box — so the assertions that actually bite are the **centre**
 * and the **area**, not the radius. §7's standard, on the item that has been got wrong most often.
 */

import { describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { arcGeometry } from '../src/core/geom/arc.ts';
import {
  type Polygon,
  polygonEdges,
  profileArea,
  profileBounds,
  profileHasArcs,
  signedArea,
} from '../src/core/geom/profile.ts';
import type { PlanRing } from '../src/core/rules/radius.ts';

import {
  insideCornerPlan,
  insideCornerSeatLineal,
  maxInsideCornerRadius,
} from '../src/core/model/insideCorner.ts';

/**
 * A plan ring as a profile polygon.
 *
 * `x, z` in the room becomes `x, y` on the board: a rename, not a transform, so area, winding and
 * every arc come through untouched — which is what lets the plan be asserted with the same
 * geometry functions a part is.
 */
const asPolygon = (ring: PlanRing): Polygon =>
  ring.map((v) => (v.bulge === undefined ? { x: v.x, y: v.z } : { x: v.x, y: v.z, bulge: v.bulge }));


const W = mm(900);
const D = mm(900);
const SEAT = mm(500);
const R = mm(150);

const plan = (over: Partial<Parameters<typeof insideCornerPlan>[0]> = {}) =>
  insideCornerPlan({ W, D, seatDepth: SEAT, radius: R, ...over });

/** Exact figures from the header. */
const PLAIN_L = 900 * 500 + 500 * 900 - 500 * 500;
const FILLET_GAIN = R * R - (Math.PI * R * R) / 4;

describe('the plan is an L, not a quarter disc', () => {
  it('spans both walls and comes one seat depth off each', () => {
    const p = plan();
    expect(profileBounds({ outline: asPolygon(p.outline), holes: [] })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 900,
      maxY: 900,
    });
    expect(p.seatDepth).toBe(SEAT);
    // The far corner of the 900 × 900 footprint is 900 from both walls. That is bed depth, and it
    // is not seat: the outline has to exclude it or the unit is a 900mm-deep box.
    expect(profileArea({ outline: asPolygon(p.outline), holes: [] })).toBeLessThan(900 * 900);
  });

  it('is wound counter-clockwise, which is what the fillet’s sign is stated against', () => {
    expect(signedArea(asPolygon(plan().outline))).toBeGreaterThan(0);
  });

  it('measures 654,828.5mm² — the L plus the fillet, not minus it', () => {
    /*
     * The assertion this whole file exists for. Filleting a reflex corner cuts the corner off the
     * void, so the seat gets **bigger**. 645,171.5 is the same fillet on the wrong side.
     */
    expect(profileArea({ outline: asPolygon(plan().outline), holes: [] })).toBeCloseTo(
      PLAIN_L + FILLET_GAIN,
      6,
    );
    expect(PLAIN_L + FILLET_GAIN).toBeCloseTo(654828.54, 2);
  });
});

describe('the fillet', () => {
  it('is tangent to both seat fronts, one radius along each from the corner', () => {
    const p = plan();
    expect([p.tangentA.x, p.tangentA.y]).toEqual([650, 500]);
    expect([p.tangentB.x, p.tangentB.y]).toEqual([500, 650]);
  });

  it('is centred out in the room, which is what makes it an inside corner', () => {
    /*
     * **The assertion that separates this unit from the one that was rejected.** A centre at
     * (500, 500) is a convex quarter disc bulging into the room — the reported "complete mess" —
     * and it has the identical radius, the identical arc length and a bounding box 150mm different
     * on a 900mm part. Nothing but the centre tells them apart.
     */
    const p = plan();
    expect([p.filletCentre.x, p.filletCentre.y]).toEqual([650, 650]);

    // And the arc the geometry engine actually builds from the stored bulge agrees, which is the
    // half that would otherwise be taken on trust.
    const arc = polygonEdges(asPolygon(p.outline)).find((e) => e.bulge !== 0)!;
    const g = arcGeometry(arc.from, arc.to, arc.bulge);
    expect(g.centre.x).toBeCloseTo(650, 9);
    expect(g.centre.y).toBeCloseTo(650, 9);
    expect(g.radius).toBeCloseTo(150, 9);
  });

  it('is a quarter turn, so the seat leaves one front and arrives square on the other', () => {
    const arc = polygonEdges(asPolygon(plan().outline)).find((e) => e.bulge !== 0)!;
    expect(arc.length).toBeCloseTo((Math.PI * R) / 2, 6);
  });

  it('gives up the curve for a square inside corner rather than drawing an impossible one', () => {
    const square = plan({ radius: mm(0) });
    expect(profileHasArcs({ outline: asPolygon(square.outline), holes: [] })).toBe(false);
    expect(profileArea({ outline: asPolygon(square.outline), holes: [] })).toBeCloseTo(PLAIN_L, 6);
    expect([square.tangentA.x, square.tangentA.y]).toEqual([500, 500]);
  });

  it('clamps a fillet with no leg left to be tangent to', () => {
    /*
     * The tangent point sits `seatDepth + r` along each leg, so a radius past that runs off the
     * open end of a leg and the outline crosses itself. On a 900 span at 500 deep there is 400 of
     * leg to work with. Clamped rather than refused: a number field fires on every keystroke.
     */
    expect(maxInsideCornerRadius({ W, D, seatDepth: SEAT })).toBe(400);
    expect(plan({ radius: mm(900) }).radius).toBe(400);
    // Still a closed, positively wound shape at the limit rather than a bow tie.
    expect(signedArea(asPolygon(plan({ radius: mm(900) }).outline))).toBeGreaterThan(0);
  });

  it('takes the shorter leg’s word for it when the two spans differ', () => {
    // 1500 along one wall, 700 along the other, 500 deep: the second leg has 200 of front left.
    expect(maxInsideCornerRadius({ W: mm(1500), D: mm(700), seatDepth: SEAT })).toBe(200);
  });
});

describe('the two seat fronts', () => {
  it('each run from the fillet to the open end of their own leg', () => {
    const p = plan();
    expect(p.frontA).toEqual({ z: 500, x0: 650, x1: 900 });
    expect(p.frontB).toEqual({ x: 500, z0: 650, z1: 900 });
  });

  it('are not symmetrical when the spans are not', () => {
    // The two legs are independent. A unit 1500 along one wall and 900 along the other has a
    // 850mm front on one leg and a 250mm front on the other.
    const p = insideCornerPlan({ W: mm(1500), D: mm(900), seatDepth: SEAT, radius: R });
    expect(p.frontA.x1 - p.frontA.x0).toBe(850);
    expect(p.frontB.z1 - p.frontB.z0).toBe(250);
  });
});

describe('what the upholsterer measures', () => {
  it('is the two straight fronts plus the fillet, along the front edge', () => {
    /*
     * §4.19's reading survives and the shape it measures does not. The old unit charged one long
     * convex arc, `radius × π/2` — 785mm on a 500 unit. This is 250 + 250 + 235.6.
     */
    const p = plan();
    expect(insideCornerSeatLineal(p)).toBeCloseTo(250 + 250 + (Math.PI * R) / 2, 6);
  });

  it('charges more than one leg’s front and less than the whole footprint', () => {
    // The same sanity bracket §4.19 put on the old reading, restated for a shape that exists.
    const p = plan();
    const lineal = insideCornerSeatLineal(p);
    expect(lineal).toBeGreaterThan(p.frontA.x1 - p.frontA.x0);
    expect(lineal).toBeLessThan(W + D);
  });

  it('follows the seat depth, because a deeper seat leaves less front', () => {
    // Not an obvious property, and it is the right one: the fronts are what is left of each span
    // once the other leg and the fillet have taken their share.
    const deep = plan({ seatDepth: mm(700) });
    expect(insideCornerSeatLineal(deep)).toBeLessThan(insideCornerSeatLineal(plan()));
  });
});
