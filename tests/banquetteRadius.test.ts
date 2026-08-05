/**
 * A rounded corner on a banquette — the seat at the end of a run.
 *
 * The carcass half of this shipped with §5.4: `formers` and `skin` are part rules of
 * `BANQUETTE_SPEC` and have been since it was rebuilt. What had never been done is the three
 * things that sit *on* that carcass — the lift-up, the solid front and the cushion — none of
 * which knew the corner was there. The lift-up was the one that could not be built: it is flush
 * with the top of the carcass by definition, and so is the topmost corner former, so on a 200mm
 * radius the two occupied the same 217 × 180 of board at the same height.
 *
 * ## The reference banquette, worked longhand
 *
 * 1200 W × 400 H × 500 D — the shipped defaults — with a 200mm radius on the front-right corner.
 * 16mm carcass and back, 18mm doors, 8mm bendy ply × 2, 1mm finish laminate, 50mm fixing strip,
 * 2mm front standoff, reveals 3 top / 0 bottom / 1.5 sides, 2mm lift-up clearance.
 *
 * ```
 *   finished front face   500 + 2 standoff + 18 door        = 520   the plane the curve lands in
 *   wrap thickness        2 × 8 + 1 laminate                =  17
 *   former radius         200 − 17                          = 183
 *   arc centre            (1200 − 200, 520 − 200)           = (1000, 320)
 *   fixing strip          min(50, 1200 − 200)               =  50   → starts at x = 950
 *   substrate end face    1200 − 17                         = 1183
 *   end panel inner face  1183 − 16                         = 1167
 * ```
 *
 * From which the two parts that had to learn about it:
 *
 * ```
 *   front     door zone 0 → 950, no reveal                 = 950 × 400 at x ∈ [0, 950]
 *   lift-up   1167 − 16 − 2×2  ×  500 − 16 − 2×2           = 1147 × 480
 *   notch     |1167 − 950|  ×  500 − 320                   = 217 × 180
 * ```
 *
 * **The front takes no reveal, and that is §5.14 rather than an oversight here.** It used to be
 * 947 × 397 — 1.5mm in at each end and 3mm down from the top — because it was cut like a door. A
 * reveal is clearance for a door to swing, and a false front does not swing; all the gap did was
 * show a white band of carcass along the top. See `fixedFrontPanel`. The strip is a different
 * thing entirely and stays: it is structure, not clearance.
 *
 * **The clearances cancel in the notch, and that is worth seeing rather than trusting.** The
 * panel's edges are already 2mm inside the opening, and the notch has to stand 2mm clear of the
 * former, so the two 2s subtract and the notch measures exactly `endInnerX − stripInnerX` by
 * `D − tangentZ`. Its corner lands on (948, 318) in cabinet space — 2mm clear of the former's
 * inner corner at (950, 320) on both axes, which is the assertion that actually says the panel
 * fits.
 *
 * ## Why the notch is square
 *
 * The same reason a shelf's is, §4.5: **a curved edge will not go through the edgebander**, and
 * this panel is banded all round because it is handled every time the storage is opened. It will
 * look like a shape that wants improving to anyone who does not know why, so the reason travels
 * with it — and `profileHasArcs` is asserted false rather than left implied.
 */

import { describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { mm } from '../src/core/units.ts';
import { isRectangular, profileArea, profileHasArcs } from '../src/core/geom/profile.ts';
import { partToCabinet } from '../src/core/geom/placement.ts';
import { v3 } from '../src/core/geom/vec.ts';
import { seatCushionPlan } from '../src/core/model/cushion.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';
import type { Project } from '../src/core/model/project.ts';
import type { Panel } from '../src/core/model/panel.ts';

const W = 1200;
const D = 500;
const H = 400;
const RADIUS = 200;

/** Where the corner former's inner corner sits, from the header. */
const STRIP_INNER_X = 950;
const TANGENT_Z = 320;

const banquette = (options: Record<string, unknown> = {}, width = W) => {
  const project = createEmptyProject('Radiused banquette');
  const base = createCabinet(
    { typeId: 'banquette', name: 'BQ1', width: mm(width), x: mm(0) },
    project.defaults,
    project.constructions,
  );
  const cabinet = { ...base, options: { ...base.options, ...options } };
  const withCabinet: Project = { ...project, cabinets: [cabinet] };
  return { project: withCabinet, cabinet, built: buildCabinet(cabinet, withCabinet) };
};

const rounded = (corner: 'front-left' | 'front-right' = 'front-right', radius = RADIUS) =>
  banquette({ radiusCorner: corner, carcassRadius: mm(radius) });

/**
 * Every vertex of a panel's outline, in **cabinet** plan coordinates.
 *
 * The one view that can say a notch is in the right place. A notch of the right size on the
 * wrong corner is the same area, the same bounding box and the same cutlist line — and on the
 * far end of the cabinet it is a lift-up with a bite out of the side nobody is standing at.
 */
const planVertices = (panel: Panel): { x: number; z: number }[] =>
  panel.profile.outline.map((v) => {
    const p = partToCabinet(panel.placement, v3(mm(v.x), mm(v.y), mm(0)));
    return { x: Math.round(p.x * 1e6) / 1e6, z: Math.round(p.z * 1e6) / 1e6 };
  });

const hasPoint = (panel: Panel, x: number, z: number): boolean =>
  planVertices(panel).some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.z - z) < 1e-6);

describe('the lift-up stops at the curve', () => {
  it('cuts a 1147 × 480 panel with a 217 × 180 notch, and no arc in it', () => {
    const lift = byName(rounded().built.panels, 'Lift-up');

    expect(size(lift)).toEqual([mm(1147), mm(480)]);
    expect(isRectangular(lift.profile)).toBe(false);
    // Square, not curved — the edgebander, not the saw. §4.5.
    expect(profileHasArcs(lift.profile)).toBe(false);
    expect(profileArea(lift.profile)).toBeCloseTo(1147 * 480 - 217 * 180, 6);
  });

  it('puts the notch 2mm clear of the former on both axes, at the corner the radius is', () => {
    /*
     * The assertion that says it fits. Everything above passes with the notch on the wrong end
     * of the panel: same size, same area, same bounding box, and a lift-up that fouls the former
     * it is meant to land beside.
     */
    const lift = byName(rounded().built.panels, 'Lift-up');
    expect(hasPoint(lift, STRIP_INNER_X - 2, TANGENT_Z - 2)).toBe(true);
    // And the far end of the panel is untouched — a full rectangle's worth of corner.
    expect(hasPoint(lift, 18, 18)).toBe(true);
  });

  it('mirrors onto the other hand rather than being written twice', () => {
    const lift = byName(rounded('front-left').built.panels, 'Lift-up');
    expect(size(lift)).toEqual([mm(1147), mm(480)]);
    // Mirrored: the former's inner corner is at x = 1200 − 950 = 250 on this hand.
    expect(hasPoint(lift, W - STRIP_INNER_X + 2, TANGENT_Z - 2)).toBe(true);
    expect(hasPoint(lift, W - 18, 18)).toBe(true);
  });

  it('does not overlap the top former it lands beside', () => {
    /*
     * Stated as the thing that was actually wrong, rather than as the shape that fixes it.
     * Before this, both the lift-up and the topmost corner former occupied y ∈ [384, 400] and
     * shared x ∈ [950, 1182] × z ∈ [320, 498] — two boards in one place, which no size or
     * bounding-box assertion in this suite could see.
     */
    const { project, built } = rounded();
    const lift = occupies(byName(built.panels, 'Lift-up'), project);
    const formers = built.panels.filter((p) => p.role === 'former');
    const top = formers.map((f) => occupies(f, project)).find((f) => f.y[1] === H);

    expect(top).toBeDefined();
    expect(lift.y).toEqual([H - 16, H]);
    // Same height, so the plan shapes have to be disjoint. The lift-up's notched corner is the
    // only part of its bounding box that reaches the former's, and it is not board there.
    expect(top!.y).toEqual([H - 16, H]);
    for (const v of planVertices(byName(built.panels, 'Lift-up'))) {
      const insideFormer = v.x > STRIP_INNER_X && v.z > TANGENT_Z;
      expect(insideFormer, `${v.x},${v.z}`).toBe(false);
    }
  });

  it('leaves the panel square when the curve never reaches the opening', () => {
    // A radius barely bigger than the 17mm wrap puts the whole former forward of the carcass
    // front, so there is nothing in the opening to notch round. Clamped, not special-cased.
    const lift = byName(rounded('front-right', 20).built.panels, 'Lift-up');
    expect(isRectangular(lift.profile)).toBe(true);
  });

  it('produces nothing at all when the curve has eaten the opening', () => {
    // A lid nobody could fit is worse than no lid. Same rule the radiused shelf uses.
    const eaten = rounded('front-right', 520);
    expect(namesOf(eaten.built.panels)).not.toContain('Lift-up');
  });
});

describe('the solid front stops at the curve', () => {
  it('fills the door zone exactly — it ends at the fixing strip and nowhere sooner', () => {
    const { project, built } = rounded();
    const front = byName(built.panels, 'Front');

    expect(size(front)).toEqual([mm(950), mm(400)]);
    expect(occupies(front, project).x).toEqual([mm(0), mm(950)]);
    // The strip is what the curved piece is fixed to; it is not door clearance to borrow back.
    expect(occupies(front, project).x[1]).toBeLessThanOrEqual(STRIP_INNER_X);
  });

  it('runs to the far end on the other hand', () => {
    const { project, built } = rounded('front-left');
    expect(occupies(byName(built.panels, 'Front'), project).x).toEqual([mm(W - 950), mm(W)]);
  });

  it('keeps its grain running along the run, curve or no curve', () => {
    // A front that got narrower has not become a door. Its length still runs across.
    expect(byName(rounded().built.panels, 'Front').placement.u).toBe('+X');
    expect(byName(rounded().built.panels, 'Front').grain).toBe('length-along-grain');
  });
});

describe('an applied end on a banquette', () => {
  it('builds one on the square end, in door decor', () => {
    const { project, built } = banquette({ appliedEnds: ['left'] });
    const panel = byName(built.panels, 'End panel L');

    expect(panel.materialId).toBe(project.defaults.doorMaterialId);
    // 520 finished front + 20 scribe = 540 deep, full seat height with nothing to drop past.
    expect(size(panel)).toEqual([mm(H), mm(540)]);
    expect(occupies(panel, project).x).toEqual([mm(-18), mm(0)]);
    expect(built.warnings).toEqual([]);
  });

  it('bands the top edge, which is at seat height with a cushion beside it', () => {
    const panel = byName(banquette({ appliedEnds: ['left'] }).built.panels, 'End panel L');
    // u = +Y, so the top edge is W2. Nothing lands on top of a banquette to hide it.
    expect(panel.edgeBanding.W2).toBeDefined();
  });

  it('leaves it off the radiused end and says why', () => {
    const { built } = banquette({
      radiusCorner: 'front-right',
      carcassRadius: mm(RADIUS),
      appliedEnds: ['left', 'right'],
    });
    expect(namesOf(built.panels)).toContain('End panel L');
    expect(namesOf(built.panels)).not.toContain('End panel R');
    expect(built.warnings.some((w) => w.includes('radiused one'))).toBe(true);
  });

  it('changes nothing else about the seat', () => {
    // Applying a panel is not a change to the cabinet — the same contract every other carcass
    // type is held to in tests/appliedEnds.ts.
    const strip = (b: ReturnType<typeof banquette>) =>
      b.built.panels
        .filter((p) => p.role !== 'end-panel')
        .map((p) => ({ name: p.name, size: size(p), box: occupies(p, b.project) }));
    expect(strip(banquette({ appliedEnds: ['left', 'right'] }))).toEqual(strip(banquette()));
  });
});

/**
 * The cushion.
 *
 * Not a `Panel` — nothing cuts, nests, bores or costs it, and §5.4 records that last one as
 * deliberately open. Its *shape* is still arithmetic, so it is worked out in `core` where a test
 * can read it rather than in the viewport where only a screenshot can. The seat that sat 25mm
 * proud of its own lid was found by measuring; a cushion ignoring a 200mm radius would just have
 * looked like a slightly boxy cushion.
 */
describe('the cushion follows the corner', () => {
  /** The finished front face, from the header: 500 + 2 standoff + 18 door. */
  const FINISHED_FRONT = 520;

  const plan = (radius: number | null, overhang = 10) =>
    seatCushionPlan({
      W: mm(W),
      D: mm(D),
      finishedFrontZ: mm(FINISHED_FRONT),
      overhang: mm(overhang),
      round: radius === null ? null : { corner: 'front-right', radius: mm(radius) },
    });

  it('runs flush to both ends and stands 10mm proud of the finished front', () => {
    const square = plan(null);
    expect([square.x0, square.x1, square.z0, square.z1]).toEqual([mm(0), mm(1200), mm(0), mm(530)]);
    expect(square.round).toBeNull();
    expect(square.endRun).toEqual({ left: mm(530), right: mm(530) });
  });

  it('lands exactly on the door face at no overhang', () => {
    // The control is adjustable, and zero has to mean the plane itself rather than "nearly".
    expect(plan(null, 0).z1).toBe(mm(FINISHED_FRONT));
  });

  it('turns the carcass radius, unchanged, with its centre moved forward', () => {
    /*
     * **The whole of the corner, and the reason there is no second radius to keep in step.** The
     * cushion is proud at the front and flush at the end, which sounds like two edges that cannot
     * be joined — and joins exactly, because an arc of radius `r` centred `o` forward of the
     * carcass centre is still tangent to both. Asserted as the two tangents rather than as the
     * radius alone, since the radius on its own passes with the arc in the wrong place.
     */
    const curved = plan(RADIUS);
    expect(curved.round).toEqual({ corner: 'front-right', radius: mm(RADIUS) });

    // Tangent to the cushion's own front edge, 10mm proud: centre z = 530 − 200 = 330, which is
    // exactly the carcass centre's 320 moved forward by the overhang.
    expect(curved.z1 - curved.round!.radius).toBe(mm(TANGENT_Z + 10));
    // Tangent to the cabinet's end face, which the cushion is flush with.
    expect(curved.x1 - curved.round!.radius).toBe(mm(W - RADIUS));
  });

  it('stops the end bolster at the tangent on the radiused end only', () => {
    // Past the tangent the seat is turning away underneath, and a straight bolster carried on
    // would be hanging over the curve in mid-air.
    const curved = plan(RADIUS);
    expect(curved.endRun.right).toBe(mm(530 - 200));
    expect(curved.endRun.left).toBe(mm(530));
    // And it moves with the radius rather than being a figure of its own.
    expect(plan(300).endRun.right).toBe(mm(530 - 300));
  });

  it('gives up the curve rather than drawing an impossible one', () => {
    // Nothing to turn is a square cushion, which is the honest answer; an impossible carcass
    // radius is reported against the carcass, in the warnings, in millimetres.
    expect(plan(0).round).toBeNull();
    expect(plan(0).endRun).toEqual({ left: mm(530), right: mm(530) });
  });

  it('clamps a radius bigger than the cushion rather than folding the outline over', () => {
    // At the limit the cushion is a quarter disc. A radius past that would wind the arc back
    // through the shape, which extrudes into something nobody could name.
    expect(plan(900).round?.radius).toBe(mm(530));
  });

  it('reads the corner the rule engine settled on, not the one that was typed', () => {
    /*
     * A radius the bendy ply cannot turn resolves to null and the carcass is built square. The
     * cushion is the one part of a banquette nobody can check against a cutlist, so it takes the
     * resolved corner off the built cabinet rather than re-reading the option.
     */
    const tight = rounded('front-right', 10);
    expect(tight.built.radius).toBeNull();
    expect(rounded().built.radius?.r).toBe(mm(RADIUS));
  });
});
