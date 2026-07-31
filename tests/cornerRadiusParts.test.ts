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
 *   rectangle      x 16 → 884 by z 16 → 560       868 × 544 = 472 192
 *   less the strip step-back, x 650 → 884 at z 544 → 560    =   3 744
 *   less the notch behind the end panel, 16 × 344           =   5 504
 *   less the corner offcut, 184² − π·8464                   =   7 265.5598
 *                                                  bottom  = 455 678.4402
 *
 *   a square cabinet's bottom      868 × 544                = 472 192
 *   so the radius costs                                     =  16 513.5598
 *   of which the corner offcut itself is                    =   7 265.5598
 * ```
 *
 * Note the rectangle and the square cabinet's bottom are now the **same** 868 × 544, and that is
 * not a coincidence: a 16mm wrap sets the substrate face back to 884, which is exactly where the
 * inner face of a 16mm side already was. At 3mm ply the radiused bottom's box was 10mm wider than
 * a square one's; at 8mm the two land on top of each other.
 *
 * The remaining 9 248 is the strip step-back plus the notch behind the end panel. What matters is
 * the order of magnitude: 3.5% of the panel, not the 96% a 200 square would be.
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
import { byName, namesOf, occupies, size } from './helpers.ts';

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
  const withCabinet: Project = { ...project, cabinets: [cabinet] };
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
    // The carcass and its wrap. Doors stand proud of the front by design and the kick hangs
    // below the carcass by design, so neither belongs in the carcass box.
    const carcass = panels.filter((p) => p.role !== 'door' && p.role !== 'kick');
    const boxes = carcass.map((p) => bentEnvelope(p, project));

    expect(Math.min(...boxes.map((b) => b.x[0]))).toBeCloseTo(0, 6);
    expect(Math.max(...boxes.map((b) => b.x[1]))).toBeCloseTo(900, 6);
    expect(Math.min(...boxes.map((b) => b.y[0]))).toBeCloseTo(0, 6);
    expect(Math.max(...boxes.map((b) => b.y[1]))).toBeCloseTo(720, 6);
    expect(Math.min(...boxes.map((b) => b.z[0]))).toBeCloseTo(0, 6);
    expect(Math.max(...boxes.map((b) => b.z[1]))).toBeCloseTo(560, 6);
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
    // 200 from (700, 360) — not "roughly round", not "the right bounding box".
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
      expect(Math.hypot(at.x - 700, at.z - 360)).toBeCloseTo(200, 6);
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
    expect(size(bottom)).toEqual([mm(868), mm(544)]);
    expect(profileHasArcs(bottom.profile)).toBe(true);
  });

  it('cuts the bottom to the area worked out longhand in the header', () => {
    expect(panelArea(byName(reference().panels, 'Bottom'))).toBeCloseTo(455678.4402, 3);
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
    expect(lost).toBeCloseTo(16513.5598, 3);
    // The set-back: the strip step-back (234 × 16) plus the notch behind the end panel (16 × 344).
    expect(lost - OFFCUT).toBeCloseTo(234 * 16 + 16 * 344, 6);
    // Still the best part of a whole panel, which is the thing the reported bug got wrong.
    expect(bottom / SQUARE_BOTTOM).toBeGreaterThan(0.96);
  });

  it('cuts the corner under the skin, not to the finished radius', () => {
    // The classic error, and the reason the formers in a radiused end are 544 and not 560. A
    // plate cut to 200 would push the ply 6mm proud of the run's front face.
    const bottom = byName(reference().panels, 'Bottom');
    const rectangle = 868 * 544 - 234 * 16 - 16 * 344;
    expect(rectangle - panelArea(bottom)).toBeCloseTo(184 * 184 * (1 - Math.PI / 4), 6);
  });
});

describe('the carcass parts', () => {
  it('keeps the end panel, set back behind the ply and short by the radius', () => {
    const { panels, project } = reference();
    const end = byName(panels, 'Side R');
    // Full depth at radius 0, gone entirely at radius = depth: 560 − 16 − 200 = 344.
    expect(size(end)).toEqual([mm(720), mm(344)]);
    // Occupancy, not just size. A panel the right size in the wrong quarter passes a size
    // assertion and is completely wrong — and here the whole question is where it sits.
    expect(occupies(end, project)).toEqual({
      x: [mm(868), mm(884)],
      y: [mm(0), mm(720)],
      z: [mm(16), mm(360)],
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
    expect(panelExtent(byName(panels, 'Skin layer 1')).length).toBeCloseTo(705.3097, 3);
    expect(panelExtent(byName(panels, 'Skin layer 2')).length).toBeCloseTo(717.8761, 3);
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
    // picked so the flat run lands where a neighbour's kick lands — set it back from the
    // finished curve instead and the kick steps back 18mm at every radiused cabinet.
    const { panels, project } = reference();
    const kick = byName(panels, 'Kick');
    expect(panelExtent(kick).length).toBeCloseTo(1320.7522, 3);
    expect(kick.forming!.innerRadius).toBe(mm(162));
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
    // 850 × 534 less a 167 × 190 bite — 167 is the shelf's right edge (867) back to the arc
    // centre (700), and 190 is its front edge (550) back to the same centre's z (360).
    expect(panelArea(shelf)).toBeCloseTo(850 * 534 - 167 * 190, 6);
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
    expect(size(byName(left.panels, 'Side L'))).toEqual([mm(720), mm(344)]);
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
      // Centre mirrored to (200, 360).
      expect(Math.hypot(at.x - 200, at.z - 360)).toBeCloseTo(200, 6);
    }
  });

  it('rounds a wall cabinet', () => {
    // 900 × 720 × 330, 150 radius: substrate 150 − 16 = 134, end panel 330 − 16 − 150 = 164
    // deep, and a wrap of 50 + (134 + 4)·π/2 + (330 − 150) = 446.7699.
    const wall = build('wall', { W: 900, H: 720, D: 330 }, {
      radiusCorner: 'front-right',
      carcassRadius: mm(150),
    });
    expect(size(byName(wall.panels, 'Side R'))).toEqual([mm(720), mm(164)]);
    expect(panelExtent(byName(wall.panels, 'Skin layer 1')).length).toBeCloseTo(446.7699, 3);
    // A wall cabinet is closed top and bottom, so both plates take the arc and no former is
    // needed at either end.
    for (const name of ['Bottom', 'Top']) {
      expect(profileHasArcs(byName(wall.panels, name).profile)).toBe(true);
      expect(size(byName(wall.panels, name))).toEqual([mm(868), mm(314)]);
    }
    expect(namesOf(wall.panels)).not.toContain('Kick');
  });

  it('rounds a tall cabinet, and puts enough formers up it', () => {
    const tall = build('tall', { W: 900, H: 2100, D: 560 }, {
      radiusCorner: 'front-right',
      carcassRadius: mm(200),
    });
    expect(size(byName(tall.panels, 'Side R'))).toEqual([mm(2100), mm(344)]);
    expect(panelExtent(byName(tall.panels, 'Skin layer 1')).length).toBeCloseTo(705.3097, 3);
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
