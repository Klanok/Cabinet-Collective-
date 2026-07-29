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
 * back, 18mm fronts, two layers of 3mm bendy ply, 150 kick set back 50, 100 top rails, shelf
 * set back 10 with 2 side clearance, 50mm fixing strip.
 *
 * ```
 *   wrap thickness    2 × 3                       = 6
 *   substrate radius  200 − 6                     = 194     what the plates are cut to
 *   arc centre        (900 − 200, 560 − 200)      = (700, 360)
 *   substrate end     900 − 6                     = 894     the face the ply lies on
 *   substrate front   560 − 6                     = 554     ditto, under the strip
 *   fixing strip      x 650 → 700, at z = 554
 *   door zone         x 0 → 650                   = 650 wide
 * ```
 *
 * and from those, every part:
 *
 * ```
 *   end panel      depth 560 − 16 − 200           = 344   × 720, at x 878 → 894
 *   far side       untouched                        544   × 720
 *   bottom         bounding box 878 × 544, corner cut to 194
 *   back           0 → 894                        = 894   × 720
 *   front rail     16 → 650                       = 634   × 100
 *   back rail      16 → 878                       = 862   × 100
 *   shelf          17 → 877 = 860 by 16 → 550 = 534, square notch 177 × 190
 *   doors          (650 − 2×1.5 − 3) ÷ 2          = 322   × 717
 *   corner former  650 → 894 = 244 by 360 → 554   = 194
 *   wrap layer 1   50 + (194 + 1.5)·π/2 + 360     = 717.0906
 *   wrap layer 2   50 + (197 + 1.5)·π/2 + 360     = 721.8030
 *   difference     3 × π/2                        = 4.712389
 *   kick           radius 200 + 18 − 50 = 168, inner 165
 *                  700 + (165 + 1.5)·π/2 + 360    = 1321.5379
 * ```
 *
 * ## The bottom, which is where the reported bug lived
 *
 * The unit was shrinking to 200 × 720 × 200 whenever the radius changed, so the bottom fell to
 * a 200 square. It has to keep its rectangle and lose **the corner offcut only**:
 *
 * ```
 *   rectangle      x 16 → 894 by z 16 → 560       878 × 544 = 477 632
 *   less the strip step-back, x 650 → 894 at z 554 → 560    =   1 464
 *   less the notch behind the end panel, 16 × 344           =   5 504
 *   less the corner offcut, 194² − π·9409                   =   8 076.7547
 *                                                  bottom  = 462 587.2453
 *
 *   a square cabinet's bottom      868 × 544                = 472 192
 *   so the radius costs                                     =   9 604.7547
 *   of which the corner offcut itself is                    =   8 076.7547
 * ```
 *
 * The remaining 1 528 is the two thin slivers the ply set-back costs — the plate reaches 10mm
 * further out than a square one to carry the wrap, and gives up 6mm of depth over the strip.
 * What matters is the order of magnitude: 2% of the panel, not the 96% a 200 square would be.
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
    expect(Math.max(...board.map((p) => bentEnvelope(p, project).x[1]))).toBeCloseTo(894, 6);
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
    expect(neutralRadius(forming, thickness) - thickness / 2).toBeCloseTo(197, 9);
  });
});

describe('sheet area falls by the corner offcut only', () => {
  const SQUARE_BOTTOM = 868 * 544;
  const OFFCUT = 194 * 194 * (1 - Math.PI / 4);

  it('keeps the bottom a full-sized panel with a bite out of one corner', () => {
    const bottom = byName(reference().panels, 'Bottom');
    // Not 194 × 194, and not 200 × 200. Still the best part of a metre across.
    expect(size(bottom)).toEqual([mm(878), mm(544)]);
    expect(profileHasArcs(bottom.profile)).toBe(true);
  });

  it('cuts the bottom to the area worked out longhand in the header', () => {
    expect(panelArea(byName(reference().panels, 'Bottom'))).toBeCloseTo(462587.2453, 3);
  });

  it('loses the offcut and a little set-back, not the whole rectangle', () => {
    const lost = SQUARE_BOTTOM - panelArea(byName(reference().panels, 'Bottom'));
    expect(OFFCUT).toBeCloseTo(8076.7547, 3);
    expect(lost).toBeCloseTo(9604.7547, 3);
    // Within a quarter of the offcut of the offcut itself — the rest is the ply set-back.
    expect(Math.abs(lost - OFFCUT)).toBeLessThan(OFFCUT / 4);
    // And what is left is still 97% of a square cabinet's bottom, not 4% of one.
    expect(panelArea(byName(reference().panels, 'Bottom')) / SQUARE_BOTTOM).toBeGreaterThan(0.97);
  });

  it('cuts the corner under the skin, not to the finished radius', () => {
    // The classic error, and the reason the formers in a radiused end are 554 and not 560. A
    // plate cut to 200 would push the ply 6mm proud of the run's front face.
    const bottom = byName(reference().panels, 'Bottom');
    const rectangle = 878 * 544 - 244 * 6 - 16 * 344;
    expect(rectangle - panelArea(bottom)).toBeCloseTo(194 * 194 * (1 - Math.PI / 4), 6);
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
      x: [mm(878), mm(894)],
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
    expect(size(byName(reference().panels, 'Back'))).toEqual([mm(894), mm(720)]);
  });

  it('stops the front rail at the fixing strip and runs the back rail to the end panel', () => {
    const { panels } = reference();
    expect(size(byName(panels, 'Top rail front'))).toEqual([mm(634), mm(100)]);
    expect(size(byName(panels, 'Top rail back'))).toEqual([mm(862), mm(100)]);
  });

  it('builds the corner formers the wrap is bent over', () => {
    const { panels } = reference();
    const formers = panels.filter((p) => p.role === 'former');
    // 704 of clear run, no gap over 300: three gaps, four plates — and the bottom is already
    // one of them, so three are cut.
    expect(formers).toHaveLength(3);
    for (const f of formers) {
      expect(size(f)).toEqual([mm(244), mm(194)]);
      expect(profileHasArcs(f.profile)).toBe(true);
      expect(f.edgeBanding).toEqual({});
    }
  });
});

describe('the wrap', () => {
  it('cuts one piece per layer: strip, quarter, then flat to the back', () => {
    const { panels } = reference();
    expect(panelExtent(byName(panels, 'Skin layer 1')).length).toBeCloseTo(717.0906, 3);
    expect(panelExtent(byName(panels, 'Skin layer 2')).length).toBeCloseTo(721.803, 3);
    expect(panelExtent(byName(panels, 'Skin layer 1')).width).toBe(mm(720));
    // Flat on the sheet. The bend lives in `forming`, where nothing dimensional reads it.
    expect(profileHasArcs(byName(panels, 'Skin layer 1').profile)).toBe(false);
  });

  it('separates the two layers by exactly one board thickness round the turn', () => {
    // Both flat tails are the same on every layer, so the tails cancel and what is left is
    // ts · π/2 — the same 4.712mm the enclosed radiused end has, tails or no tails.
    const { panels } = reference();
    const first = panelExtent(byName(panels, 'Skin layer 1')).length;
    const second = panelExtent(byName(panels, 'Skin layer 2')).length;
    expect(second - first).toBeCloseTo(3 * QUARTER, 5);
  });

  it('starts the bend after the fixing strip rather than at the end of the part', () => {
    const skin = byName(reference().panels, 'Skin layer 1');
    expect(skin.forming!.from).toBe(mm(50));
    expect(skin.forming!.innerRadius).toBe(mm(194));
    expect(skin.forming!.sweep).toBeCloseTo(QUARTER, 9);
  });

  it('turns the kick round the corner too, on the plane a square cabinet’s kick sits on', () => {
    // A flat board across the front would be a chord cutting the corner off. The radius is
    // picked so the flat run lands where a neighbour's kick lands — set it back from the
    // finished curve instead and the kick steps back 18mm at every radiused cabinet.
    const { panels, project } = reference();
    const kick = byName(panels, 'Kick');
    expect(panelExtent(kick).length).toBeCloseTo(1321.5379, 3);
    expect(kick.forming!.innerRadius).toBe(mm(165));
    expect(kick.materialId).toBe(project.defaults.skinMaterialId);
    // The flat run sits at z = 560 + 18 − 50 = 528, exactly where `kickPanel` puts a square
    // cabinet's kick face.
    const face = partToCabinet(
      kick.placement,
      formPoint(kick.forming!, mm(3), { x: mm(0), y: mm(0), z: mm(3) }),
    );
    expect(face.z).toBeCloseTo(528, 6);
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
    expect(size(shelf)).toEqual([mm(860), mm(534)]);
    // 860 × 534 less a 177 × 190 bite.
    expect(panelArea(shelf)).toBeCloseTo(860 * 534 - 177 * 190, 6);
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
    expect(occupies(byName(left.panels, 'Side L'), left.project).x).toEqual([mm(6), mm(22)]);
    expect(occupies(byName(right.panels, 'Side R'), right.project).x).toEqual([mm(878), mm(894)]);
  });

  it('holds the radius on the left hand too, measured on the finished face', () => {
    const left = reference({ radiusCorner: 'front-left' });
    const skin = byName(left.panels, 'Skin layer 2');
    const { from, to } = formedSpan(skin.forming!, mm(3));
    for (let i = 0; i <= 20; i++) {
      const along = from + ((to - from) * i) / 20;
      const at = partToCabinet(
        skin.placement,
        formPoint(skin.forming!, mm(3), { x: mm(along), y: mm(0), z: mm(3) }),
      );
      // Centre mirrored to (200, 360).
      expect(Math.hypot(at.x - 200, at.z - 360)).toBeCloseTo(200, 6);
    }
  });

  it('rounds a wall cabinet', () => {
    // 900 × 720 × 330, 150 radius: substrate 144, end panel 330 − 16 − 150 = 164 deep, and a
    // wrap of 50 + (144 + 1.5)·π/2 + (330 − 150) = 458.5510.
    const wall = build('wall', { W: 900, H: 720, D: 330 }, {
      radiusCorner: 'front-right',
      carcassRadius: mm(150),
    });
    expect(size(byName(wall.panels, 'Side R'))).toEqual([mm(720), mm(164)]);
    expect(panelExtent(byName(wall.panels, 'Skin layer 1')).length).toBeCloseTo(458.551, 3);
    // A wall cabinet is closed top and bottom, so both plates take the arc and no former is
    // needed at either end.
    for (const name of ['Bottom', 'Top']) {
      expect(profileHasArcs(byName(wall.panels, name).profile)).toBe(true);
      expect(size(byName(wall.panels, name))).toEqual([mm(878), mm(314)]);
    }
    expect(namesOf(wall.panels)).not.toContain('Kick');
  });

  it('rounds a tall cabinet, and puts enough formers up it', () => {
    const tall = build('tall', { W: 900, H: 2100, D: 560 }, {
      radiusCorner: 'front-right',
      carcassRadius: mm(200),
    });
    expect(size(byName(tall.panels, 'Side R'))).toEqual([mm(2100), mm(344)]);
    expect(panelExtent(byName(tall.panels, 'Skin layer 1')).length).toBeCloseTo(717.0906, 3);
    expect(panelExtent(byName(tall.panels, 'Skin layer 1')).width).toBe(mm(2100));
    // 2084 of clear run, no gap over 300, closed top and bottom by plates that take the arc.
    const formers = tall.panels.filter((p) => p.role === 'former');
    expect(formers).toHaveLength(6);
    for (const f of formers) expect(size(f)).toEqual([mm(244), mm(194)]);
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
