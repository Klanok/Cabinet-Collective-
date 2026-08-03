/**
 * A corner radius on an ordinary carcass — the parts, worked longhand.
 *
 * `tests/cornerRadius.test.ts` pins both ends of the range: radius 0 is yesterday's cabinet,
 * and radius = width = depth is the quarter-round unit. This file is the middle — the sizes a
 * real one actually cuts to, and the two things the shop owner reported.
 *
 * ## The reference cabinet
 *
 * A base cabinet **900 × 720 × 560**, front-right corner rounded **200**. 16mm carcass and
 * back, 18mm fronts, two layers of **8mm** bendy ply, 150 kick set back 50, 100 top rails, shelf
 * set back 10 with 2 side clearance, 50mm fixing strip, 2mm front standoff.
 *
 * ```
 *   wrap thickness    2 × 8                       = 16
 *   substrate radius  200 − 16                    = 184     what the plates are cut to
 *   arc centre        (900 − 200, 560 − 200)      = (700, 360)
 *   substrate end     900 − 16                    = 884     the face the ply lies on
 *   substrate front   560 − 16                    = 544     ditto, under the strip
 *   fixing strip      x 650 → 700, at z = 544
 *   door zone         x 0 → 650                   = 650 wide
 * ```
 *
 * and from those, every part:
 *
 * ```
 *   end panel      depth 560 − 16 − 200           = 344   × 720, at x 868 → 884
 *   far side       untouched                        544   × 720
 *   bottom         bounding box 868 × 544, corner cut to 184
 *   back           0 → 884                        = 884   × 720
 *   front rail     16 → 650                       = 634   × 100
 *   back rail      16 → 868                       = 852   × 100
 *   doors          (650 − 2×1.5 − 3) ÷ 2          = 322   × 717
 *   corner former  650 → 884 = 234 by 360 → 544   = 184
 *   wrap layer 1   50 + (184 + 4)·π/2 + 360       = 705.3097
 *   wrap layer 2   50 + (192 + 4)·π/2 + 360       = 717.8761
 *   difference     8 × π/2                        = 12.566371
 *   kick           radius 200 + 18 door + 2 standoff − 50 = 170, inner 162
 *                  700 + (162 + 4)·π/2 + 360      = 1320.7522
 * ```
 *
 * The `+ 4` in each wrap length is half a layer — the ply bends about its own neutral axis, so a
 * developed length is struck on the middle of the sheet, not its inside face. At 3mm ply that was
 * `+ 1.5` and the difference between two layers was `3·π/2`; at 8mm it is `8·π/2`, which is the
 * single clearest sign the thickness really did flow all the way through.
 *
 * ## The bottom, which is where the reported bug lived
 *
 * The unit was shrinking to 200 × 720 × 200 whenever the radius changed, so the bottom fell to
 * a 200 square. It has to keep its rectangle and lose **the corner offcut only**:
 *
 * ```
 *   rectangle      x 16 → 884 by z 16 → 564       868 × 548 = 475 664
 *   less the flat front, x 16 → 650 at z 560 → 564  634 × 4   =   2 536
 *   less the notch behind the end panel, 16 × 364            =   5 824
 *   less the corner offcut, 184² − π·8464                    =   7 265.5598
 *                                                   bottom  = 460 038.4402
 *
 *   a square cabinet's bottom      868 × 544                 = 472 192
 *   so the radius costs                                      =  12 153.5598
 *   of which the corner offcut itself is                     =   7 265.5598
 * ```
 *
 * **The plate now steps *forward* under the wrap rather than back**, and that is the corner-radius
 * datum fix rather than a re-tuned number. The curve finishes in the plane the doors finish in —
 * 560 + 2 standoff + 18 door = **580** — so the substrate face under it sits at 580 − 16 = 564,
 * four millimetres *proud* of the carcass front. Under the doors the plate still stops at 560,
 * which is what the `634 × 4` line takes off. A bottom on a radiused cabinet was always doing a
 * former's job as well as its own; carrying the curve out to the finished face is that job stated
 * properly.
 *
 * The end-panel notch grows with it: the tangent moves forward from 360 to 380, so the panel is
 * 364 deep rather than 344 and the notch behind it is 16 × 364.
 *
 * What the test is for is unchanged and is the thing the reported bug got wrong: the bottom keeps
 * its rectangle. The radius costs 12 153 out of 472 192 — 2.6% of the panel, not the 96% a 200
 * square would be.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import type { CabinetOptions, CabinetTypeId } from '../src/core/model/cabinet.ts';
import type { Project } from '../src/core/model/project.ts';
import { type Panel, panelArea, panelExtent } from '../src/core/model/panel.ts';
import { formPoint, formedSpan, neutralRadius } from '../src/core/model/forming.ts';
import { partToCabinet } from '../src/core/geom/placement.ts';
import { profileHasArcs } from '../src/core/geom/profile.ts';
import { v3 } from '../src/core/geom/vec.ts';
import { actualThicknessOf, findSheet } from '../src/core/model/material.ts';
import { byName, namesOf, occupies, size, withoutFinishLaminate } from './helpers.ts';

const QUARTER = Math.PI / 2;

interface Built {
  readonly project: Project;
  readonly panels: readonly Panel[];
  readonly warnings: readonly string[];
}

const build = (
  typeId: CabinetTypeId,
  dims: { W: number; H: number; D: number },
  options: CabinetOptions,
): Built => {
  const project = createEmptyProject('Corner radius parts');
  const cabinet = createCabinet({
    typeId,
    name: 'X1',
    x: mm(0),
    width: mm(dims.W),
    height: mm(dims.H),
    depth: mm(dims.D),
    options,
  });
  /*
   * No finish laminate here. Every figure in this file was derived longhand for the wrap alone —
   * formers, substrate radius, developed lengths — and those derivations are still exactly right
   * about the wrap. The 1mm the shipped method allows for hand-laminating a curve is a separate
   * allowance on top, and it has its own tests below; folding it in here would leave each figure
   * a millimetre off a number somebody worked out on paper, for a reason unrelated to what the
   * test is about.
   */
  const withCabinet: Project = { ...withoutFinishLaminate(project), cabinets: [cabinet] };
  const built = buildCabinet(cabinet, withCabinet);
  return { project: withCabinet, panels: built.panels, warnings: built.warnings };
};

const BASE = { W: 900, H: 720, D: 560 };

/** The reference cabinet, with the fronts and the shelf asked for rather than defaulted away. */
const reference = (extra: CabinetOptions = {}): Built =>
  build('base', BASE, {
    radiusCorner: 'front-right',
    carcassRadius: mm(200),
    doorCount: 2,
    shelfCount: 1,
    ...extra,
  });

/**
 * Where a panel really sits, **once anything that bends has been bent**.
 *
 * `occupies` reads the flat, as-cut part through its placement, which is the right answer for
 * every part that stays flat and a wildly wrong one for a wrap: laid out flat, a 717mm skin
 * starting at x = 650 reaches x = 1367, which is half a metre past the end of the cabinet.
 * Bending it is what brings it back inside, so the test that says the box did not shrink has
 * to bend it first — measuring the flat part would fail on a cabinet that is perfectly right.
 */
const bentEnvelope = (panel: Panel, project: Project) => {
  const thickness = actualThicknessOf(findSheet(project.materials, panel.materialId));
  const { length, width } = panelExtent(panel);
  const points: { x: number; y: number; z: number }[] = [];

  const STEPS = 64;
  for (let i = 0; i <= STEPS; i++) {
    const x = (length * i) / STEPS;
    for (const y of [0, width]) {
      for (const z of [0, thickness]) {
        const local = panel.forming
          ? formPoint(panel.forming, thickness, { x: mm(x), y: mm(y), z: mm(z) })
          : v3(mm(x), mm(y), mm(z));
        points.push(partToCabinet(panel.placement, local));
      }
    }
  }
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const axis = (get: (v: { x: number; y: number; z: number }) => number) =>
    [round(Math.min(...points.map(get))), round(Math.max(...points.map(get)))] as const;
  return { x: axis((v) => v.x), y: axis((v) => v.y), z: axis((v) => v.z) };
};

beforeEach(() => resetIdCounter());

describe('the box does not shrink', () => {
  it('still measures 900 × 720 × 560 with a 200 radius on it', () => {
    // The reported bug, written as an assertion. `radiusEnd.ts` says the radius *is* the width
    // and *is* the depth, so a 200 there gives a 200 × 720 × 200 unit — correct for a quarter
    // round, and not what an ordinary cabinet with one rounded corner does.
    const { panels, project } = reference();
    // Doors stand proud of the carcass by design and the kick hangs below it by design, so
    // neither belongs in the carcass box.
    const carcass = panels.filter((p) => p.role !== 'door' && p.role !== 'kick');
    const boxes = carcass.map((p) => bentEnvelope(p, project));

    expect(Math.min(...boxes.map((b) => b.x[0]))).toBeCloseTo(0, 6);
    expect(Math.max(...boxes.map((b) => b.x[1]))).toBeCloseTo(900, 6);
    expect(Math.min(...boxes.map((b) => b.y[0]))).toBeCloseTo(0, 6);
    expect(Math.max(...boxes.map((b) => b.y[1]))).toBeCloseTo(720, 6);
    expect(Math.min(...boxes.map((b) => b.z[0]))).toBeCloseTo(0, 6);

    /*
     * In depth the answer is two numbers, and it was one only while the curve was wrong.
     *
     * The **carcass** still stops at 560 — the cabinet did not get deeper. The **wrap** reaches
     * 580, because at that corner the ply is the finish and it has to land in the same plane the
     * doors land in. Asserting a single 560 here would now be asserting the bug.
     */
    // Three levels, and each is a different job. The sides and the back stop at the carcass
    // front; the plates reach 4mm past it to the substrate face, because forward of the end
    // panel they are the only thing holding the curve; the wrap lands on the doors' plane.
    const carries = (p: Panel) =>
      p.role === 'bottom' || p.role === 'top' || p.role === 'former';
    const upright = carcass.filter((p) => p.role !== 'skin' && !carries(p));
    expect(Math.max(...upright.map((p) => bentEnvelope(p, project).z[1]))).toBeCloseTo(560, 6);
    const formers = carcass.filter(carries);
    expect(Math.max(...formers.map((p) => bentEnvelope(p, project).z[1]))).toBeCloseTo(564, 6);
    expect(Math.max(...boxes.map((b) => b.z[1]))).toBeCloseTo(580, 6);
    const door = bentEnvelope(byName(panels, 'Door L'), project).z[1];
    expect(Math.max(...boxes.map((b) => b.z[1]))).toBeCloseTo(door, 6);
  });

  it('reaches the full width with the outside of the wrap, not with a carcass part', () => {
    // The x = 900 face of a radiused cabinet is bendy ply, and the carcass under it stops a
    // whole wrap thickness short so the ply finishes flush. If a carcass part were still
    // reaching 900 the ply would stand 6mm proud of the rest of the run.
    const { panels, project } = reference();
    const board = panels.filter((p) => p.role !== 'door' && p.role !== 'skin' && p.role !== 'kick');
    expect(Math.max(...board.map((p) => bentEnvelope(p, project).x[1]))).toBeCloseTo(884, 6);
    expect(bentEnvelope(byName(panels, 'Skin layer 2'), project).x[1]).toBeCloseTo(900, 6);
  });

  it('holds the stated radius all the way round, measured on the finished face', () => {
    // Section 7: a quarter circle and a box are hard to tell apart in a screenshot, so the
    // curve is checked as a number. Every point on the outside of the outer skin is exactly
    // 200 from (700, 380) — not "roughly round", not "the right bounding box".
    //
    // The centre is (W − r, finishedFrontZ − r) = (900 − 200, 580 − 200). It moved forward with
    // the finish plane when the curve stopped being measured off the carcass: 360 was the old
    // carcass-datum centre, and a curve struck about it finished 20mm behind the doors.
    const { panels, project } = reference();
    const skin = byName(panels, 'Skin layer 2');
    const forming = skin.forming!;
    const thickness = actualThicknessOf(findSheet(project.materials, skin.materialId));
    const { from, to } = formedSpan(forming, thickness);

    for (let i = 0; i <= 40; i++) {
      const along = from + ((to - from) * i) / 40;
      // Part z = thickness is the A-face: the outside of the bend, which is the finished face.
      const local = formPoint(forming, thickness, { x: mm(along), y: mm(0), z: mm(thickness) });
      const at = partToCabinet(skin.placement, local);
      expect(Math.hypot(at.x - 700, at.z - 380)).toBeCloseTo(200, 6);
    }
    // And the substrate under it is exactly one wrap thickness tighter, which is what makes
    // the ply the same thickness the whole way round rather than pinching at the corner.
    expect(neutralRadius(forming, thickness) - thickness / 2).toBeCloseTo(192, 9);
  });
});

describe('sheet area falls by the corner offcut only', () => {
  const SQUARE_BOTTOM = 868 * 544;
  const OFFCUT = 184 * 184 * (1 - Math.PI / 4);

  it('keeps the bottom a full-sized panel with a bite out of one corner', () => {
    const bottom = byName(reference().panels, 'Bottom');
    // Not 184 × 184, and not 200 × 200. Still the best part of a metre across.
    // 16 → 564 deep: back panel face to the substrate under the wrap, which the datum fix
    // pushed 4mm forward of the carcass front. See the header.
    expect(size(bottom)).toEqual([mm(868), mm(548)]);
    expect(profileHasArcs(bottom.profile)).toBe(true);
  });

  it('cuts the bottom to the area worked out longhand in the header', () => {
    expect(panelArea(byName(reference().panels, 'Bottom'))).toBeCloseTo(460038.4402, 3);
  });

  /**
   * The claim here changed shape when the ply went from 3mm to 8mm, and it is worth keeping the
   * change rather than quietly re-tuning a threshold.
   *
   * At 3mm the offcut dominated and the set-back was a rounding error — the test could say "within
   * a quarter of the offcut" and mean it. At 8mm the wrap is 16mm thick, the substrate is set back
   * 16mm on two faces, and **the set-back now costs more than the offcut does**: 9 248 against
   * 7 266. That is a real fact about building the corner out of thicker ply, not a tolerance to
   * widen.
   *
   * What the test is actually for survives untouched: the reported bug turned the bottom into a
   * 200 square, 4% of a full panel. It is still 96.5% of one.
   */
  it('loses the offcut and the ply set-back, not the whole rectangle', () => {
    const bottom = panelArea(byName(reference().panels, 'Bottom'));
    const lost = SQUARE_BOTTOM - bottom;
    expect(OFFCUT).toBeCloseTo(7265.5598, 3);
    expect(lost).toBeCloseTo(12153.5598, 3);
    // What the radius costs beyond the offcut: the flat front stopping at the carcass (634 × 4)
    // plus the notch behind the end panel (16 × 364), less the 4mm the plate now gains across
    // its whole width by reaching forward to the finished face.
    expect(lost - OFFCUT).toBeCloseTo(634 * 4 + 16 * 364 - 868 * 4, 6);
    // Still the best part of a whole panel, which is the thing the reported bug got wrong.
    expect(bottom / SQUARE_BOTTOM).toBeGreaterThan(0.96);
  });

  it('cuts the corner under the skin, not to the finished radius', () => {
    // The classic error, and the reason the formers in a radiused end are 544 and not 560. A
    // plate cut to 200 would push the ply 6mm proud of the run's front face.
    const bottom = byName(reference().panels, 'Bottom');
    const rectangle = 868 * 548 - 634 * 4 - 16 * 364;
    expect(rectangle - panelArea(bottom)).toBeCloseTo(184 * 184 * (1 - Math.PI / 4), 6);
  });
});

describe('the carcass parts', () => {
  it('keeps the end panel, set back behind the ply and short by the radius', () => {
    const { panels, project } = reference();
    const end = byName(panels, 'Side R');
    // Back panel face to the tangent: (560 + 2 + 18) − 200 − 16 = 364. It still shortens with
    // the radius; it is measured from the finished face now rather than from the carcass.
    expect(size(end)).toEqual([mm(720), mm(364)]);
    // Occupancy, not just size. A panel the right size in the wrong quarter passes a size
    // assertion and is completely wrong — and here the whole question is where it sits.
    expect(occupies(end, project)).toEqual({
      x: [mm(868), mm(884)],
      y: [mm(0), mm(720)],
      z: [mm(16), mm(380)],
    });
  });

  it('leaves the far side alone', () => {
    const { panels, project } = reference();
    expect(size(byName(panels, 'Side L'))).toEqual([mm(720), mm(544)]);
    expect(occupies(byName(panels, 'Side L'), project)).toEqual({
      x: [mm(0), mm(16)],
      y: [mm(0), mm(720)],
      z: [mm(16), mm(560)],
    });
  });

  it('stops the back at the substrate face so the wrap can run past it', () => {
    expect(size(byName(reference().panels, 'Back'))).toEqual([mm(884), mm(720)]);
  });

  it('stops the front rail at the fixing strip and runs the back rail to the end panel', () => {
    const { panels } = reference();
    expect(size(byName(panels, 'Top rail front'))).toEqual([mm(634), mm(100)]);
    expect(size(byName(panels, 'Top rail back'))).toEqual([mm(852), mm(100)]);
  });

  it('builds the corner formers the wrap is bent over', () => {
    const { panels } = reference();
    const formers = panels.filter((p) => p.role === 'former');
    // 704 of clear run, no gap over 300: three gaps, four plates — and the bottom is already
    // one of them, so three are cut.
    expect(formers).toHaveLength(3);
    for (const f of formers) {
      expect(size(f)).toEqual([mm(234), mm(184)]);
      expect(profileHasArcs(f.profile)).toBe(true);
      expect(f.edgeBanding).toEqual({});
    }
  });
});

describe('the wrap', () => {
  it('cuts one piece per layer: strip, quarter, then flat to the back', () => {
    const { panels } = reference();
    // Strip + quarter + flat tail to the back. Each is 20mm longer than under the old carcass
    // datum, and all 20 of it is tail: the arc is the same 200 radius, but its tangent on the end
    // face moved forward from z = 360 to z = 380, so there is 20mm more flat behind it.
    expect(panelExtent(byName(panels, 'Skin layer 1')).length).toBeCloseTo(725.3097, 3);
    expect(panelExtent(byName(panels, 'Skin layer 2')).length).toBeCloseTo(737.8761, 3);
    expect(panelExtent(byName(panels, 'Skin layer 1')).width).toBe(mm(720));
    // Flat on the sheet. The bend lives in `forming`, where nothing dimensional reads it.
    expect(profileHasArcs(byName(panels, 'Skin layer 1').profile)).toBe(false);
  });

  it('separates the two layers by exactly one board thickness round the turn', () => {
    // Both flat tails are the same on every layer, so the tails cancel and what is left is
    // ts · π/2 — the same 12.566mm the enclosed radiused end has, tails or no tails. At 3mm ply
    // this was 4.712; that it tracked the board is the point of the assertion.
    const ts = actualThicknessOf(findSheet(reference().project.materials, 'bendy-ply-8'));
    const { panels } = reference();
    const first = panelExtent(byName(panels, 'Skin layer 1')).length;
    const second = panelExtent(byName(panels, 'Skin layer 2')).length;
    expect(second - first).toBeCloseTo(ts * QUARTER, 5);
  });

  it('starts the bend after the fixing strip rather than at the end of the part', () => {
    const skin = byName(reference().panels, 'Skin layer 1');
    expect(skin.forming!.from).toBe(mm(50));
    expect(skin.forming!.innerRadius).toBe(mm(184));
    expect(skin.forming!.sweep).toBeCloseTo(QUARTER, 9);
  });

  it('turns the kick round the corner too, on the plane a square cabinet’s kick sits on', () => {
    // A flat board across the front would be a chord cutting the corner off. The radius is
    // picked so the flat run lands where a neighbour's kick lands: now that the carcass curve is
    // struck about the finished face, that is simply `r − kickSetback` = 150 outside, 142 inside.
    const { panels, project } = reference();
    const kick = byName(panels, 'Kick');
    // Flats 1080 (each 20 longer, as the skins are) plus the arc on the neutral axis,
    // 146 · π/2 = 229.336.
    expect(panelExtent(kick).length).toBeCloseTo(1309.3363, 3);
    expect(kick.forming!.innerRadius).toBe(mm(142));
    expect(kick.materialId).toBe(project.defaults.skinMaterialId);
    // The flat run sits at z = 560 + 2 + 18 − 50 = 530, exactly where `kickPanel` puts a square
    // cabinet's kick face.
    // Struck on the outside of the ply, so the thickness comes from the board rather than being
    // typed — which is what stopped this reading 525 when the ply went from 3mm to 8mm.
    const ply = actualThicknessOf(findSheet(project.materials, project.defaults.skinMaterialId));
    const face = partToCabinet(
      kick.placement,
      formPoint(kick.forming!, ply, { x: mm(0), y: mm(0), z: ply }),
    );
    expect(face.z).toBeCloseTo(530, 6);
  });
});

describe('doors and shelves', () => {
  it('sizes the doors to the door zone, clear of the fixing strip', () => {
    const { panels } = reference();
    expect(size(byName(panels, 'Door L'))).toEqual([mm(717), mm(322)]);
    expect(size(byName(panels, 'Door R'))).toEqual([mm(717), mm(322)]);
  });

  it('keeps the doors off the strip rather than merely narrowing them', () => {
    const { panels, project } = reference();
    // The right-hand door's right edge lands on 650 less the reveal, not on 900 less it.
    expect(occupies(byName(panels, 'Door R'), project).x[1]).toBeCloseTo(648.5, 6);
    expect(occupies(byName(panels, 'Door L'), project).x[0]).toBeCloseTo(1.5, 6);
  });

  it('measures the pair check on the door zone, not on the full width', () => {
    // A 550 radius on a 900 leaves 300mm of door front. Measuring the full width would call
    // that fine and quietly cut two 147mm doors.
    const tight = build('base', BASE, {
      radiusCorner: 'front-right',
      carcassRadius: mm(550),
      doorCount: 2,
    });
    expect(tight.warnings.join(' ')).toMatch(/300mm of door front on a 900mm cabinet/);
    // And a square 900 still says nothing at all, which is what stops the check crying wolf.
    expect(build('base', BASE, { doorCount: 2 }).warnings).toEqual([]);
  });

  it('notches the shelf square, and says why', () => {
    const shelf = byName(reference().panels, 'Shelf');
    expect(size(shelf)).toEqual([mm(850), mm(534)]);
    // 850 × 534 less a 167 × 170 bite — 167 is the shelf's right edge (867) back to the arc
    // centre (700), and 170 is its front edge (550) back to the same centre's z, which moved
    // forward to 380 with the finish plane.
    expect(panelArea(shelf)).toBeCloseTo(850 * 534 - 167 * 170, 6);
    // Square, not curved — and the reason is the edgebander, not the saw.
    expect(profileHasArcs(shelf.profile)).toBe(false);
    expect(shelf.note).toMatch(/will not go through the edgebander/);
  });

  it('defaults a radiused cabinet to no doors and no shelves', () => {
    // The common use for one of these is a decorative end, not a cupboard.
    const decorative = build('base', BASE, {
      radiusCorner: 'front-right',
      carcassRadius: mm(200),
    });
    expect(namesOf(decorative.panels)).not.toContain('Door L');
    expect(namesOf(decorative.panels)).not.toContain('Shelf');
    // A default, not a rule: asking for a door still gives you one.
    expect(namesOf(reference().panels)).toContain('Door L');
  });
});

describe('either hand, and every carcass type', () => {
  it('mirrors a front-left radius exactly', () => {
    const right = reference();
    const left = reference({ radiusCorner: 'front-left' });

    // Every part is the same size; which end is short is the only thing that changes.
    const sizes = (b: Built) =>
      b.panels
        .map((p) => `${size(p)[0].toFixed(4)}×${size(p)[1].toFixed(4)}`)
        .sort();
    expect(sizes(left)).toEqual(sizes(right));
    expect(size(byName(left.panels, 'Side L'))).toEqual([mm(720), mm(364)]);
    expect(size(byName(left.panels, 'Side R'))).toEqual([mm(720), mm(544)]);

    // And the curve is on the other side of the room, which is the whole point of naming the
    // corner: same size, wrong quarter is the failure this cannot be allowed to pass.
    expect(occupies(byName(left.panels, 'Side L'), left.project).x).toEqual([mm(16), mm(32)]);
    expect(occupies(byName(right.panels, 'Side R'), right.project).x).toEqual([mm(868), mm(884)]);
  });

  it('holds the radius on the left hand too, measured on the finished face', () => {
    const left = reference({ radiusCorner: 'front-left' });
    const skin = byName(left.panels, 'Skin layer 2');
    // The board, not a typed 3 — the finished face is the outside of whatever ply is on it.
    const ply = actualThicknessOf(
      findSheet(left.project.materials, left.project.defaults.skinMaterialId),
    );
    const { from, to } = formedSpan(skin.forming!, ply);
    for (let i = 0; i <= 20; i++) {
      const along = from + ((to - from) * i) / 20;
      const at = partToCabinet(
        skin.placement,
        formPoint(skin.forming!, ply, { x: mm(along), y: mm(0), z: ply }),
      );
      // Centre mirrored to (200, 380) — the same finish-plane z the right hand uses.
      expect(Math.hypot(at.x - 200, at.z - 380)).toBeCloseTo(200, 6);
    }
  });

  it('rounds a wall cabinet', () => {
    // 900 × 720 × 330, 150 radius: substrate 150 − 16 = 134, end panel (330 + 20) − 150 − 16 = 184
    // deep, and a wrap of 50 + (134 + 4)·π/2 + (330 − 150) = 466.7699.
    const wall = build('wall', { W: 900, H: 720, D: 330 }, {
      radiusCorner: 'front-right',
      carcassRadius: mm(150),
    });
    expect(size(byName(wall.panels, 'Side R'))).toEqual([mm(720), mm(184)]);
    expect(panelExtent(byName(wall.panels, 'Skin layer 1')).length).toBeCloseTo(466.7699, 3);
    // A wall cabinet is closed top and bottom, so both plates take the arc and no former is
    // needed at either end.
    for (const name of ['Bottom', 'Top']) {
      expect(profileHasArcs(byName(wall.panels, name).profile)).toBe(true);
      // 16 → 334: back face to the substrate under the wrap, (330 + 20) − 16.
      expect(size(byName(wall.panels, name))).toEqual([mm(868), mm(318)]);
    }
    expect(namesOf(wall.panels)).not.toContain('Kick');
  });

  it('rounds a tall cabinet, and puts enough formers up it', () => {
    const tall = build('tall', { W: 900, H: 2100, D: 560 }, {
      radiusCorner: 'front-right',
      carcassRadius: mm(200),
    });
    expect(size(byName(tall.panels, 'Side R'))).toEqual([mm(2100), mm(364)]);
    expect(panelExtent(byName(tall.panels, 'Skin layer 1')).length).toBeCloseTo(725.3097, 3);
    expect(panelExtent(byName(tall.panels, 'Skin layer 1')).width).toBe(mm(2100));
    // 2084 of clear run, no gap over 300, closed top and bottom by plates that take the arc.
    const formers = tall.panels.filter((p) => p.role === 'former');
    expect(formers).toHaveLength(6);
    for (const f of formers) expect(size(f)).toEqual([mm(234), mm(184)]);
  });

  it('splits a tall cabinet’s doors inside the door zone', () => {
    const tall = build('tall', { W: 900, H: 2100, D: 560 }, {
      radiusCorner: 'front-right',
      carcassRadius: mm(200),
      doorCount: 2,
      doorSplitHeight: mm(1200),
    });
    for (const name of ['Door lower L', 'Door lower R', 'Door upper L', 'Door upper R']) {
      expect(size(byName(tall.panels, name))[1]).toBe(mm(322));
    }
  });
});

describe('a radius the ply cannot turn', () => {
  /*
   * The crash this file exists to keep out, found by using the app.
   *
   * A number field fires on every keystroke, so typing "200" makes the app resolve a **2mm**
   * radius first. Two layers of 3mm ply leave nothing of a 2mm radius, `cylindricalForming`
   * rightly refuses a radius that isn't positive — and the throw took the whole app to a blank
   * screen. Worse, the job is saved as you type, so every reload loaded it back and blanked
   * again; the only way out was the browser's developer console.
   *
   * So the boundary gets tested at every value around it, not just at one. 6 is exactly the ply
   * and must not build; 7 is a millimetre of substrate and must.
   */
  const KEYSTROKES = [1, 2, 5, 6, 7, 20, 200, 2000];

  it('never throws, at any radius somebody could type', () => {
    for (const r of KEYSTROKES) {
      for (const corner of ['front-left', 'front-right'] as const) {
        for (const typeId of ['base', 'wall', 'tall'] as const) {
          expect(() =>
            build(typeId, BASE, { radiusCorner: corner, carcassRadius: mm(r) }),
          ).not.toThrow();
        }
      }
    }
  });

  it('draws the cabinet square when the radius is smaller than the ply round it', () => {
    // Two layers of 3mm: 6 is exactly the wrap and leaves nothing, 7 leaves a millimetre.
    for (const r of [1, 2, 5, 6]) {
      const tight = build('base', BASE, { radiusCorner: 'front-right', carcassRadius: mm(r) });
      for (const p of tight.panels) {
        expect(profileHasArcs(p.profile)).toBe(false);
        expect(p.forming).toBeUndefined();
      }
      // Square, but not silent. A radius that quietly does nothing reads as a broken field.
      expect(tight.warnings.join(' ')).toMatch(/nothing left to bend it round/);
    }
  });

  it('builds the corner as soon as there is any substrate left to bend round', () => {
    // Two layers of 8mm eat 16, so 17 is the first radius with substrate left. At 3mm it was 7.
    const just = build('base', BASE, { radiusCorner: 'front-right', carcassRadius: mm(17) });
    expect(profileHasArcs(byName(just.panels, 'Bottom').profile)).toBe(true);
    expect(byName(just.panels, 'Skin layer 1').forming!.innerRadius).toBe(mm(1));
    expect(just.warnings.join(' ')).not.toMatch(/nothing left to bend it round/);
  });

  it('moves the boundary with the board, rather than hard-coding a number', () => {
    // One layer of 8mm ply leaves substrate at 9, where two layers would not. The whole point is
    // that this boundary tracks the board: at 3mm ply the same test read 4 and one layer.
    const thin = build('base', BASE, {
      radiusCorner: 'front-right',
      carcassRadius: mm(9),
      skinLayers: 1,
    });
    expect(profileHasArcs(byName(thin.panels, 'Bottom').profile)).toBe(true);
    expect(byName(thin.panels, 'Skin').forming!.innerRadius).toBe(mm(1));
  });
});

describe('what it says when the numbers do not work', () => {
  it('draws a cabinet square, and says so, when the corner was never named', () => {
    // `carcassRadius` does nothing on its own, and must not guess. A caller that guessed would
    // put the curve against the wall, where it is the right size and completely wrong.
    const nameless = build('base', BASE, { carcassRadius: mm(200) });
    expect(nameless.warnings.join(' ')).toMatch(/no corner named/);
    for (const p of nameless.panels) expect(profileHasArcs(p.profile)).toBe(false);
  });

  it('reports a radius that leaves too little flat front to fix the curve to', () => {
    const tight = build('base', BASE, {
      radiusCorner: 'front-right',
      carcassRadius: mm(880),
    });
    expect(tight.warnings.join(' ')).toMatch(/of flat front, and the curved piece is fixed/);
  });

  it('reports a radius bigger than the cabinet it is on', () => {
    const silly = build('base', BASE, { radiusCorner: 'front-right', carcassRadius: mm(700) });
    expect(silly.warnings.join(' ')).toMatch(/does not fit a 900 × 560 cabinet/);
  });

  it('says to pick one when a shelf is asked to bow and turn a corner at once', () => {
    const both = build('base', BASE, {
      radiusCorner: 'front-right',
      carcassRadius: mm(200),
      shelfCount: 1,
      shelfBow: mm(40),
    });
    expect(both.warnings.join(' ')).toMatch(/two curves arguing over one edge/i);
  });
});

/**
 * The finish laminate over a curved wrap.
 *
 * From the bench: *"we need to start allowing 1mm for laminating now, which will be done by hand
 * after machining"* — *"this will mean the curve has the finish texture applied to match the
 * doors"*. The bendy ply is substrate; a 1mm laminate goes over it as the finish so the curve
 * carries the same decor as the fronts either side of it.
 *
 * Every assertion here is about the difference between what the **machine** cuts and what the
 * **finished cabinet** measures. Those were the same number until the laminate existed, which is
 * exactly why it is worth pinning down.
 */
describe('the finish laminate over a curve', () => {
  const laminated = (allowance: number): Built => {
    const project = createEmptyProject('Laminated curve');
    const cabinet = createCabinet({
      typeId: 'base',
      name: 'X1',
      x: mm(0),
      width: mm(900),
      height: mm(720),
      depth: mm(560),
      options: { radiusCorner: 'front-right', carcassRadius: mm(200), doorCount: 2 },
    });
    const withLam: Project = {
      ...project,
      constructions: project.constructions.map((c) => ({ ...c, finishLaminate: mm(allowance) })),
      cabinets: [cabinet],
    };
    const built = buildCabinet(cabinet, withLam);
    return { project: withLam, panels: built.panels, warnings: built.warnings };
  };

  it('ships on the shipped method, at 1mm', () => {
    const project = createEmptyProject('Shipped');
    expect(project.constructions[0]!.finishLaminate).toBe(1);
  });

  it('brings the machined wrap in by the laminate, and no more', () => {
    const bare = laminated(0);
    const withLam = laminated(1);
    const outer = (b: Built) =>
      bentEnvelope(byName(b.panels, 'Skin layer 2'), b.project).x[1];

    // The ply is substrate now, so it stops a laminate short of where it used to finish.
    expect(outer(bare)).toBeCloseTo(900, 6);
    expect(outer(withLam)).toBeCloseTo(899, 6);
  });

  it('leaves the finished cabinet exactly the size it was — the box still does not shrink', () => {
    // The invariant the whole radius feature exists to protect, restated for a laminated curve:
    // the machined parts come in by 1mm and the laminate puts it back, so the cabinet a client
    // measures is still 900 wide.
    const b = laminated(1);
    const lam = b.project.constructions[0]!.finishLaminate;
    const carcass = b.panels.filter((p) => p.role !== 'door' && p.role !== 'kick');
    const machined = Math.max(...carcass.map((p) => bentEnvelope(p, b.project).x[1]));
    expect(machined + lam).toBeCloseTo(900, 6);
  });

  it('cuts the substrate corner a laminate smaller too, so the curve is round at the finish', () => {
    /*
     * Taking the laminate off the skin alone would leave the plate cut to the old 184 and the
     * finished curve proud of its own radius — round, but not the radius that was asked for.
     *
     * Measured the way the bare case is measured a few tests up: the corner bite is
     * `r² (1 − π/4)`, so a substrate radius of 183 rather than 184 leaves a *bigger* plate.
     */
    const cornerNote = (b: Built) => byName(b.panels, 'Bottom').note;
    // 200 finished, less two 8mm plies = 184 with no laminate; less the 1mm laminate as well = 183.
    expect(cornerNote(laminated(0))).toContain('184mm radius');
    expect(cornerNote(laminated(1))).toContain('183mm radius');
  });

  it('is a dimension, not a part — the machine never sees it', () => {
    // It goes on by hand at the bench, so nothing is cut for it and nothing appears on the
    // cutlist. If it ever becomes a costed material that is a separate decision.
    const bare = laminated(0);
    const withLam = laminated(1);
    expect(namesOf(withLam.panels)).toEqual(namesOf(bare.panels));
  });
});
