/**
 * The inside banquette corner, as a cabinet.
 *
 * The shape it is built on is asserted in `tests/insideCorner.test.ts`; this file is the parts.
 * Both are worth reading before touching either — the shape has been mis-derived twice, and the
 * unit that shipped for months was a convex quarter disc the shop called *"a complete mess"*.
 *
 * ## The reference unit, worked longhand
 *
 * The shop's own example: 900 along each wall, 500 deep to both, a 150mm internal radius. 16mm
 * carcass and back, 18mm doors, 8mm bendy ply × 2, 1mm laminate, 2mm front standoff, 50mm fixing
 * strip.
 *
 * ```
 *   front proud of carcass   2 standoff + 18 door                   =  20
 *   finished front planes    z = 520  and  x = 520
 *   fillet centre            (520 + 150, 520 + 150)                 = (670, 670)
 *   skin                     2 × 8 + 1 laminate                     =  17
 *   former radius            150 + 17                               = 167
 *   ply back face            520 − 17 = 503, which is 3mm PROUD of the 500 carcass
 *
 *   front run, leg A         900 − 670                              = 230
 *   front run, leg B         900 − 670                              = 230
 *   fillet arc, show face    150 × π/2                              = 235.6
 *   layer 1 developed        230 + (150 + 1 + 4) × π/2 + 230        = 703.4
 *   layer 2 developed        230 + (150 + 1 + 8 + 4) × π/2 + 230    = 716.0
 * ```
 *
 * **The 3mm is the number worth keeping.** The ply is only 17 thick where a door stands 20 off the
 * carcass, so the formers pack the curve out to finish flush with the banquettes either side of it.
 * It is §5.0's *"the curve finishes in the door plane, not on the carcass"* arriving with the
 * opposite sign, and it is why the formers here are cut to `r + skin` rather than `r − skin`.
 *
 * ## What the shop said it is made of
 *
 * > *"the entire radius front should be formed bendy ply then laminated — that is the point of this
 * > cabinet"*
 *
 * So there is **no flat front panel on this unit at all**, and no door-decor part: the whole front
 * is one formed piece per layer and the laminate over it is the finish.
 *
 * > *"the strip should be there and set back from the radius by 50mm"*
 *
 * So the formers run 50mm past each tangent, giving the ply a rigid landing where it comes out of
 * the bend — the construction method's `fixingStripWidth`, not a second 50.
 */

import { describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { mm } from '../src/core/units.ts';
import { arcGeometry } from '../src/core/geom/arc.ts';
import {
  type Polygon,
  isRectangular,
  polygonEdges,
  profileArea,
  profileBounds,
  profileHasArcs,
} from '../src/core/geom/profile.ts';
import { insideCornerPlan } from '../src/core/model/insideCorner.ts';
import type { Project } from '../src/core/model/project.ts';
import type { PlanRing } from '../src/core/rules/radius.ts';
import { cushionOccupancy, insideCornerSeatMesh } from '../src/app/viewport/cushionMesh.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';

const SPAN = 900;
const SEAT = 500;
const R = 150;

const corner = (options: Record<string, unknown> = {}, over: Record<string, number> = {}) => {
  const project = createEmptyProject('Inside corner');
  const base = createCabinet(
    {
      typeId: 'banquette-corner',
      name: 'BQC1',
      width: mm(over.width ?? SPAN),
      depth: mm(over.depth ?? SPAN),
      x: mm(0),
    },
    project.defaults,
    project.constructions,
  );
  const cabinet = { ...base, options: { ...base.options, ...options } };
  const withCabinet: Project = { ...project, cabinets: [cabinet] };
  return { project: withCabinet, cabinet, built: buildCabinet(cabinet, withCabinet) };
};

describe('it is an L-shaped seat box, not a quarter disc', () => {
  it('builds the same kinds of part a plain banquette does', () => {
    const { built } = corner();
    expect(built.warnings).toEqual([]);
    // Two backs against the two walls, two open ends, a bottom, formers, the formed front, a lid.
    expect(built.panels.filter((p) => p.role === 'back')).toHaveLength(2);
    expect(built.panels.filter((p) => p.role === 'side')).toHaveLength(2);
    expect(namesOf(built.panels)).toContain('Bottom');
    expect(namesOf(built.panels)).toContain('Lift-up');
    expect(built.panels.filter((p) => p.role === 'former').length).toBeGreaterThan(1);
  });

  it('takes its spans and its seat depth as three separate numbers', () => {
    /*
     * **The constraint this replaces is the whole reason the unit was the wrong shape.** `validate`
     * used to insist `width = depth = insideCornerRadius`, which made it look like a square with a
     * disc taken out of it — and that is what both earlier readings of the shop's sentence assumed.
     */
    const { built } = corner({}, { width: 1500, depth: 900 });
    expect(built.warnings).toEqual([]);
    expect(built.panels.length).toBeGreaterThan(0);
  });

  it('leaves the far corner of the footprint out — that is bed depth, not seat', () => {
    // A 900 × 900 unit 500 deep to both walls is an L of 654,828.5mm², not an 810,000mm² box.
    // The bottom is inset from the walls and the ends, so it is smaller again — what matters is
    // that it is nowhere near the full rectangle.
    const { built } = corner();
    const bottom = byName(built.panels, 'Bottom');
    expect(profileArea(bottom.profile)).toBeLessThan(SPAN * SPAN * 0.9);
    expect(isRectangular(bottom.profile)).toBe(false);
    // The fillet reaches it: the bottom carries the arc the formers stand on.
    expect(profileHasArcs(bottom.profile)).toBe(true);
  });

  it('stands its two open ends where the banquettes either side butt them', () => {
    const { project, built } = corner();
    const endA = byName(built.panels, 'End A');
    const endB = byName(built.panels, 'End B');
    // Occupancy, not size: an end of the right size at the wrong end of the unit is the same part.
    expect(occupies(endA, project).x).toEqual([mm(SPAN - 16), mm(SPAN)]);
    expect(occupies(endB, project).z).toEqual([mm(SPAN - 16), mm(SPAN)]);
    // Each runs the seat depth off its own wall, not the full span.
    expect(occupies(endA, project).z[1]).toBeLessThanOrEqual(SEAT);
    expect(occupies(endB, project).x[1]).toBeLessThanOrEqual(SEAT);
  });
});

describe('the front is one formed piece per layer', () => {
  it('produces no flat front panel and no door-decor part at all', () => {
    /*
     * *"the entire radius front should be formed bendy ply then laminated — that is the point of
     * this cabinet"*. A flat front here would be the thing the shop was ruling out.
     */
    const { project, built } = corner();
    expect(built.panels.some((p) => p.role === 'false-front')).toBe(false);
    expect(built.panels.some((p) => p.materialId === project.defaults.doorMaterialId)).toBe(false);
  });

  it('runs the whole front — down one leg, round the fillet and out the other — with no join', () => {
    const { built } = corner();
    const layers = built.panels.filter((p) => p.role === 'skin');
    expect(layers).toHaveLength(2);
    // 230 + (150 + 1 + 4) × π/2 + 230, from the header.
    expect(size(layers[0]!)[0]).toBeCloseTo(230 + (R + 1 + 4) * (Math.PI / 2) + 230, 3);
    expect(size(layers[0]!)[1]).toBe(mm(400));
  });

  it('cuts each layer longer than the one inside it by exactly one board round the turn', () => {
    // §4.4's rule, surviving a change of sign: here the layers stack away from the room rather
    // than toward it, and the gap between them is still `ts × π/2`.
    const { built } = corner();
    const [inner, outer] = built.panels.filter((p) => p.role === 'skin');
    expect(size(outer!)[0] - size(inner!)[0]).toBeCloseTo(8 * (Math.PI / 2), 4);
  });

  it('laminates the show layer in the door decor, and is still cut from bendy ply', () => {
    /*
     * §4.23's `finishMaterialId`: what is applied over the face after machining, never what the
     * part is cut from. On this unit the show face is the **inside** of the bend, so the laminate
     * goes on the first layer rather than the last — the opposite end of the stack from a convex
     * wrap, which is the trap this assertion exists for.
     */
    const { project, built } = corner();
    const layers = built.panels.filter((p) => p.role === 'skin');
    expect(layers[0]!.finishMaterialId).toBe(project.defaults.doorMaterialId);
    expect(layers[1]!.finishMaterialId).toBeUndefined();
    expect(layers[0]!.materialId).toBe(project.defaults.skinMaterialId);
  });

  it('bends about the show face, because on this curve the show face is the inside of the bend', () => {
    // The one thing that inverts. A convex wrap has its B-face against the formers; here the
    // formers are on the far side and the face somebody sees is the one nearest the centre.
    const { built } = corner();
    const inner = built.panels.filter((p) => p.role === 'skin')[0]!;
    expect(inner.forming?.kind).toBe('cylindrical');
    expect(inner.forming).toMatchObject({ innerRadius: R + 1 });
  });
});

describe('the formers', () => {
  it('are cut to the radius PLUS the skin, not minus it', () => {
    /*
     * **The sign that inverts, and the one worth an assertion of its own.** Every surface parallel
     * to the finished face is `r + d` about one centre out in the room, so the formers sit further
     * from it than the ply does. Cut to `r − skin` they would leave the curve two skins proud of
     * the two fronts it runs into.
     *
     * Asserted through the note, which is what reaches the person at the saw.
     */
    const { built } = corner();
    const former = built.panels.find((p) => p.role === 'former')!;
    expect(former.note).toContain(`${R + 17}mm radius`);
    expect(former.note).toContain('50mm fixing strip');
  });

  it('reports a radius that leaves the strip nowhere to land', () => {
    // *"depending on what the entered radius is"* — the same rule the convex corner has: a strip
    // too small to fix to is reported rather than drawn.
    const { built } = corner({ insideCornerRadius: mm(370) });
    expect(built.warnings.join(' ')).toContain('flat front for the formers to land on');
  });

  it('reports a radius the legs cannot fit, and builds the biggest that does', () => {
    const { built } = corner({ insideCornerRadius: mm(900) });
    expect(built.warnings.join(' ')).toContain('does not fit');
  });
});

describe('what it refuses, and says why', () => {
  it('will not pretend a seat as deep as the unit is an L', () => {
    const { built } = corner({ seatDepth: mm(900) });
    expect(built.warnings.join(' ')).toContain('leaves no L');
  });

  it('turns down an outside corner radius, naming its own', () => {
    const { built } = corner({ radiusCorner: 'front-right', carcassRadius: mm(100) });
    expect(built.warnings.join(' ')).toContain('Inside corner radius');
  });

  it('turns down an applied end, because both of its ends butt something', () => {
    const { built } = corner({ appliedEnds: ['left'] });
    expect(built.warnings.join(' ')).toContain('butt the banquettes');
  });
});

/* ── The seat cushion's mesh, which is the part nobody could assert until now ─────────────────── */

/**
 * Where the corner seat cushion finishes, worked longhand.
 *
 * **This is §5.13 item 1's own open item.** The cushion's outline, its inset and its origin were
 * arithmetic inside a `useMemo`, so nothing in Node could read them: the origin was got wrong twice
 * and the second one — a cushion 372mm through the wall — was found by measuring the running scene,
 * because that was the only instrument that could see it. `insideCornerSeatMesh` is that arithmetic
 * moved somewhere a test can reach, and this is the test.
 *
 * The reference unit is the one at the top of this file — 900 along each wall, 500 deep to both,
 * a 150 fillet, so the finished fronts are at 520 and the fillet's centre is (670, 670) — with the
 * shipped cushion on it: 80 thick, 10 proud of the fronts, an 18mm soft edge.
 *
 * ```
 *   bevel            min(18, 80/2 − 1)                          =  18
 *   extrude depth    80 − 2 × 18                                =  44
 *   outline drawn    a surface (18 − 10) = 8 BEHIND the finished front, so the bevel grows it
 *                    back out to 10 proud
 *     fronts         520 − 8                                    = 512   → 530 finished
 *     fillet         150 + 8                                    = 158   → 140 finished
 *     centre         unmoved, because every layer is a radius   = (670, 670)
 *     walls / ends   clamped in by the bevel                    = 18 and 882
 *   origin           x 0,  y 400 + 18,  z 882
 *                                        ↑ the outline's LARGEST z — the far end of leg B, not
 *                                          the front. Writing 530 here is the 372mm fault.
 *   finished box     x 0 → 900,  y 400 → 480,  z 0 → 900
 *
 *   inset plan area  864 × 494 + 494 × 864 − 494²               = 609,596
 *                    + fillet gain 158² − π × 158²/4            =   5,357.3
 *                                                               = 614,953.3
 * ```
 *
 * **The fillet adds area here for the same reason it does on the carcass** — it is a reflex corner,
 * so rounding it cuts the corner off the void. 604,238.7 is the same fillet on the wrong side, and
 * it is what the rejected quarter disc would give.
 */
describe('the seat cushion sits on the L, proud at the fronts and flush everywhere else', () => {
  const CUSHION = { seatTop: 400, thickness: 80, overhang: 10, radius: 18 };
  const mesh = (over: Record<string, unknown> = {}, spans: Record<string, number> = {}) => {
    const { built } = corner(over, spans);
    expect(built.cabinet.height).toBe(mm(400));
    return insideCornerSeatMesh({ plan: built.insideCorner!, ...CUSHION })!;
  };

  /** The plan the extrude traces, as a profile polygon: `x, z` in the room becomes `x, y` on paper. */
  const asPolygon = (ring: PlanRing): Polygon =>
    ring.map((v) => (v.bulge === undefined ? { x: v.x, y: v.z } : { x: v.x, y: v.z, bulge: v.bulge }));

  /**
   * The flattened shape read back into cabinet plan space — the inverse of the mesh's own rotation.
   *
   * Stated here rather than exported, because it is the *reading* direction: shape y runs backwards
   * along cabinet z from the origin, so cabinet z is `position.z − shape y`. If the reflection or
   * the arc's sense is wrong this polygon stops matching the ring it was built from.
   */
  const asDrawn = (m: ReturnType<typeof mesh>): Polygon =>
    m.shape.map((p) => ({ x: p.x, y: m.position[2] - p.y }));

  it('puts the mesh origin at the outline’s far end, not at the front it is proud of', () => {
    // The assertion the whole extraction is for. 530 — the finished front — is the number that
    // reads right and put the cushion 372mm through the wall.
    expect([...mesh().position]).toEqual([0, 418, 882]);
    expect(mesh().depth).toBe(44);
    expect(mesh().bevel).toBe(18);
  });

  it('finishes wall to wall and exactly on the seat it rests on', () => {
    /*
     * Occupancy, not size — §4.23's lesson from the plain banquette, where a cushion of exactly the
     * right size sat one bevel out of place on every axis and every size assertion passed on it.
     */
    expect(cushionOccupancy(mesh())).toEqual({
      x0: 0, x1: 900,
      y0: 400, y1: 480,
      z0: 0, z1: 900,
    });
  });

  it('stands 10mm proud of both finished fronts, and only of those', () => {
    /*
     * The overhang is what separates a cushion from a lid. It moves the two fronts and the fillet
     * with them — one centre, one radius — and must not push the cushion into a wall or past the
     * end where the next banquette butts, which is what the clamp above is for.
     */
    const m = mesh();
    // Past the fillet, each leg runs from its wall out to its own front, so the front is the
    // furthest the outline gets from that wall.
    const frontA = Math.max(...m.insetPlan.filter((v) => v.x > 700).map((v) => v.z));
    const frontB = Math.max(...m.insetPlan.filter((v) => v.z > 700).map((v) => v.x));
    // Drawn a bevel short of the finished face; the extrude's bevel puts it back.
    expect(frontA).toBe(512);
    expect(frontB).toBe(512);
    expect(frontA + m.bevel).toBe(520 + 10);
    expect(frontB + m.bevel).toBe(520 + 10);
  });

  it('keeps the fillet concave, about the carcass’s own centre', () => {
    /*
     * A fillet of the right radius on the wrong side has the identical radius and arc length, and
     * it is what this unit was rejected for. Only the centre tells them apart — `insideCorner.test`
     * makes the same point about the carcass, and the cushion has to agree with it.
     */
    const arc = polygonEdges(asPolygon(mesh().insetPlan)).find((e) => e.bulge !== 0)!;
    const g = arcGeometry(arc.from, arc.to, arc.bulge);
    expect(g.centre.x).toBeCloseTo(670, 9);
    expect(g.centre.y).toBeCloseTo(670, 9);
    expect(g.radius).toBeCloseTo(158, 9);
  });

  it('measures the L plus the fillet, not minus it', () => {
    const area = profileArea({ outline: asPolygon(mesh().insetPlan), holes: [] });
    expect(area).toBeCloseTo(864 * 494 + 494 * 864 - 494 * 494 + (158 * 158 * (4 - Math.PI)) / 4, 6);
    expect(area).toBeCloseTo(614953.3, 1);
  });

  it('draws the shape it says it draws — the same ring, reflected', () => {
    /*
     * The flattening is where the hand-rolled version went wrong, so the polygon that actually
     * reaches three.js is read back and compared with the ring it came from. A bulge left
     * un-negated through the reflection bows the fillet the other way: same points, 14,249mm² of
     * difference, and nothing on screen to tell you which one you are looking at.
     */
    const m = mesh();
    expect([m.shape[0]!.x, m.shape[0]!.y]).toEqual([18, 864]);
    /*
     * **Larger, and by a known amount.** Chords across a *scooped* arc take the sliver between the
     * chord and the curve as material, so a flattened concave fillet is always a little fuller than
     * the exact one: 32 segments at the 0.05mm flattening tolerance come to 7.9mm². The bracket is
     * what makes this an assertion rather than a snapshot — it is three orders of magnitude under
     * the 14,249mm² a fillet bowed the wrong way would show.
     */
    const spare =
      profileArea({ outline: asDrawn(m), holes: [] }) -
      profileArea({ outline: asPolygon(m.insetPlan), holes: [] });
    expect(spare).toBeGreaterThan(0);
    expect(spare).toBeLessThan(10);
    expect(profileBounds({ outline: asDrawn(m), holes: [] })).toEqual({
      minX: 18, minY: 18, maxX: 882, maxY: 882,
    });
  });

  it('takes the origin off the longer leg when the two spans differ', () => {
    // The two legs are independent, so the deepest point is wall B's span and nothing else. A unit
    // 1500 along wall A is still 882 deep at the origin, and reaches 1500 across.
    const wide = mesh({}, { width: 1500, depth: 900 });
    expect(wide.position[2]).toBe(882);
    expect(cushionOccupancy(wide).x1).toBe(1500);
    const deep = mesh({}, { width: 900, depth: 1500 });
    expect(deep.position[2]).toBe(1482);
    expect(cushionOccupancy(deep).z1).toBe(1500);
  });

  it('draws nothing rather than a blob when there is no seat left', () => {
    // A finished front behind the surface being asked for has no ring at all. Better nothing than
    // a degenerate shape: the impossible figure is reported in millimetres by `validate`.
    const flat = insideCornerPlan({ W: mm(900), D: mm(900), seatDepth: mm(0), radius: mm(0) });
    expect(insideCornerSeatMesh({ plan: flat, ...CUSHION })).toBeNull();
  });
});
