/**
 * A benchtop's rounded corner — the top over a radiused base cabinet.
 *
 * The cabinet's box does not shrink when its corner is rounded (§4.5), so the top over it was
 * always the right *size*. It simply had a square corner sitting over a round cabinet, which on
 * the one corner of a kitchen where the top's edge is the thing a hand lands on is not a
 * cosmetic difference.
 *
 * ## Reference figures, worked longhand
 *
 * The fixture is a 900 × 720 × 560 base cabinet with a 200mm front-right corner radius, with a
 * shop-made 18mm top over it at the standard overhangs — 20 at the front, 0 everywhere else.
 *
 * ```
 *   top length              900 + 0 + 0            =  900
 *   top depth               560 + 20 + 0           =  580
 *   corner radius R                                =  200      (the cabinet's own)
 *
 *   arc centre, part space  (900 − 200, 200)       =  (700, 200)
 *   corner offcut           (1 − π/4) · 200²       =  8 584.073…mm²
 *   plan area               900 · 580 − offcut     =  513 415.926…mm²
 *   front edge (L1)         (900 − 200) + π·200/2  =  1 014.159…mm
 * ```
 *
 * **Why the arc centre is the assertion that matters.** A rounded corner of the right radius in
 * the wrong quarter is the same size, nests on the same blank, bands to a similar length and
 * looks entirely convincing in a screenshot — it is `bowedFrontProfile`'s handedness trap and
 * §4.9's mirrored arc, arriving a third time. A slab lies decor face up with `v = −Z`, so part y
 * runs from the **front** towards the back: the front corners are at y = 0, and a centre at
 * (700, 380) instead of (700, 200) would be a top rounded against the wall.
 *
 * ## Why the top's radius is the cabinet's own, exactly
 *
 * A corner radius is struck about `finishedFrontZ` — the door plane, 580 on a 560 carcass, see
 * §5.0 — and the shop's standard 20mm front overhang puts the top's front edge on that same
 * plane. The end overhang of 0 lands the top's end on the cabinet's end face. So the fillet's
 * centre *is* the cabinet's arc centre and the top follows the curve with a constant overhang
 * the whole way round. That coincidence is the reason `corners` can be seeded from
 * `carcassRadius` with no arithmetic in between, and the test below pins it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  type Benchtop,
  benchtopPlanArea,
  finishedEdgeLength,
  SQUARE_BENCHTOP_CORNERS,
} from '../src/core/model/benchtop.ts';
import { CURRENT_SCHEMA_VERSION, migrateProject } from '../src/core/model/project.ts';
import type { Project } from '../src/core/model/project.ts';
import { arcGeometry } from '../src/core/geom/arc.ts';
import { extrudeProfile } from '../src/core/geom/extrude.ts';
import {
  isRectangular,
  polygonEdges,
  profileArea,
  profileEdgeLengths,
  profileExtent,
  roundedCornerProfile,
} from '../src/core/geom/profile.ts';
import { generateBenchtops, regenerateBenchtop } from '../src/core/project/generate.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import { buildBenchtop } from '../src/core/rules/runUnits.ts';
import { buildCutlist } from '../src/core/cutlist/cutlist.ts';
import { byName, occupies, size } from './helpers.ts';

let project: Project;

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Benchtop corner test');
});

/** A run of `n` cabinets, the last of which may carry a corner radius. */
const runWith = (options: Record<string, unknown>, width = mm(900)): Project => ({
  ...project,
  cabinets: [
    createCabinet(
      { typeId: 'base', name: 'B1', width, x: mm(0), options },
      project.defaults,
      project.constructions,
    ),
  ],
});

/** That run, with a shop-made top generated over it. */
const withTop = (p: Project, materialId = 'shopmade-hmr-mdf-18'): [Project, Benchtop] => {
  const tops = generateBenchtops(p, materialId);
  const next: Project = { ...p, benchtops: tops };
  return [next, tops[0]!];
};

const RIGHT_200 = { radiusCorner: 'front-right' as const, carcassRadius: mm(200) };
const RIGHT_300 = { radiusCorner: 'front-right' as const, carcassRadius: mm(300) };

/*
 * ── What the run hands the top ───────────────────────────────────────────────────────────────
 */

describe('generating a top over a radiused cabinet', () => {
  it('takes the cabinet’s own radius, on the end the cabinet is rounded at', () => {
    const [, top] = withTop(runWith(RIGHT_200));
    expect(top.corners).toEqual({ left: 0, right: 200 });
  });

  /**
   * The handedness assertion, and it is not the same test twice. A radius read off the cabinet
   * but applied to the wrong end of the run gives a top of exactly the right size with exactly
   * the right amount of material missing, at the other end of the kitchen.
   */
  it('rounds the left corner for a front-left cabinet, and only the left', () => {
    const [, top] = withTop(runWith({ radiusCorner: 'front-left', carcassRadius: mm(200) }));
    expect(top.corners).toEqual({ left: 200, right: 0 });
  });

  it('leaves a square cabinet’s top square, and its ends into a wall', () => {
    const [, top] = withTop(runWith({}));
    expect(top.corners).toEqual(SQUARE_BENCHTOP_CORNERS);
    expect(top.ends).toEqual({ left: 'wall', right: 'wall' });
  });

  /**
   * Nobody rounds a corner that dies into a wall — the curve is there because that end is on
   * show. Seeding it as `wall` would generate a top that contradicts itself the moment it exists.
   */
  it('calls a radiused end exposed rather than walled', () => {
    const [, top] = withTop(runWith(RIGHT_200));
    expect(top.ends).toEqual({ left: 'wall', right: 'exposed' });
  });

  it('ignores a radius that is not at either end of the run', () => {
    // A front-right radius on the cabinet at the *left* end of a two-cabinet run is an internal
    // corner. It is a fact about that carcass and not a corner of the top.
    const p: Project = {
      ...project,
      cabinets: [
        createCabinet(
          { typeId: 'base', name: 'B1', width: mm(900), x: mm(0), options: RIGHT_200 },
          project.defaults,
          project.constructions,
        ),
        createCabinet(
          { typeId: 'base', name: 'B2', width: mm(900), x: mm(900) },
          project.defaults,
          project.constructions,
        ),
      ],
    };
    const [, top] = withTop(p);
    expect(top.corners).toEqual(SQUARE_BENCHTOP_CORNERS);
  });
});

/*
 * ── Owned, not derived ───────────────────────────────────────────────────────────────────────
 */

describe('a top’s corner is owned', () => {
  it('does not follow the cabinet until somebody regenerates', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const squared: Project = {
      ...p,
      cabinets: p.cabinets.map((c) => ({ ...c, options: { ...c.options, carcassRadius: mm(0) } })),
    };
    // The top is still the top somebody agreed to.
    expect(squared.benchtops[0]!.corners.right).toBe(200);
    expect(buildBenchtop(top, squared).warnings).toEqual([]);
  });

  /**
   * `corners` follows the run on a regenerate, like `carcassDepth` and unlike an overhang.
   * "Put the top back over the cabinets" has to mean putting the curve back over the curve —
   * otherwise deleting the radiused cabinet leaves a rounded top over a square run, which is the
   * bug this change exists to fix arriving from the other direction.
   */
  it('follows the cabinet when it is regenerated', () => {
    const [p] = withTop(runWith(RIGHT_200));
    const squared: Project = {
      ...p,
      cabinets: p.cabinets.map((c) => ({ ...c, options: { ...c.options, carcassRadius: mm(0) } })),
    };
    expect(regenerateBenchtop(squared, squared.benchtops[0]!).corners.right).toBe(0);
  });

  it('keeps an overhang somebody set while the corner follows the run', () => {
    const [p] = withTop(runWith(RIGHT_200));
    const edited: Benchtop = {
      ...p.benchtops[0]!,
      overhangs: { front: mm(40), back: mm(10), left: mm(0), right: mm(300) },
    };
    const back = regenerateBenchtop({ ...p, benchtops: [edited] }, edited);
    expect(back.overhangs).toEqual(edited.overhangs);
    expect(back.corners.right).toBe(200);
  });
});

/*
 * ── The shape itself ─────────────────────────────────────────────────────────────────────────
 */

describe('the slab', () => {
  const slabOf = (p: Project, top: Benchtop) => byName(buildBenchtop(top, p).panels, 'Benchtop');

  it('does not shrink — the box is the box it always was', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const slab = slabOf(p, top);
    // 900 long, 560 + 20 deep. The corner is cut out of that rectangle, not off it.
    expect(size(slab)).toEqual([900, 580]);
    expect(profileExtent(slab.profile)).toEqual({ length: 900, width: 580 });
    expect(occupies(slab, p).x).toEqual([0, 900]);
  });

  /** The invariant that protects every top already quoted. */
  it('produces a plain rectangle when the corners are square', () => {
    const [p, top] = withTop(runWith({}));
    expect(isRectangular(slabOf(p, top).profile)).toBe(true);
  });

  /**
   * Where the arc's centre lands, which is the assertion a wrong quarter cannot survive.
   * See the header — a top rounded against the wall centres at y = 380, not y = 200.
   */
  it('puts the arc in the front-right quarter, centred on the cabinet’s own centre', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const arc = polygonEdges(slabOf(p, top).profile.outline).find((e) => e.bulge !== 0)!;
    const g = arcGeometry(arc.from, arc.to, arc.bulge);
    expect(g.radius).toBeCloseTo(200, 6);
    expect(g.centre.x).toBeCloseTo(700, 6);
    expect(g.centre.y).toBeCloseTo(200, 6);
    // A quarter turn, counter-clockwise, convex on the outline.
    expect(g.sweep).toBeCloseTo(Math.PI / 2, 9);
    expect(g.ccw).toBe(true);
  });

  it('mirrors cleanly to the other hand', () => {
    const [p, top] = withTop(runWith({ radiusCorner: 'front-left', carcassRadius: mm(200) }));
    const arc = polygonEdges(slabOf(p, top).profile.outline).find((e) => e.bulge !== 0)!;
    const g = arcGeometry(arc.from, arc.to, arc.bulge);
    expect(g.centre.x).toBeCloseTo(200, 6);
    expect(g.centre.y).toBeCloseTo(200, 6);
    expect(g.sweep).toBeCloseTo(Math.PI / 2, 9);
  });

  /** Area and banding measured off the real boundary, not the bounding box. */
  it('loses the corner offcut and no more', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const offcut = (1 - Math.PI / 4) * 200 * 200;
    expect(profileArea(slabOf(p, top).profile)).toBeCloseTo(900 * 580 - offcut, 6);
    expect(offcut).toBeCloseTo(8584.073464, 6);
  });

  it('bands the front round the curve, at the arc rather than the chord', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const edges = profileEdgeLengths(slabOf(p, top).profile);
    // 700mm of straight front, then a quarter of a 200 circle.
    expect(edges.L1).toBeCloseTo(700 + (Math.PI * 200) / 2, 6);
    expect(edges.L1).toBeCloseTo(1014.159265, 6);
    // The chord would be 700 + 282.84 — nearly 32mm of tape short.
    expect(edges.L1).toBeGreaterThan(700 + Math.hypot(200, 200));
  });

  /** §3: a curved edge cannot go through the edgebander, and whoever cuts it has to know. */
  it('says the curve is hand work', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    expect(slabOf(p, top).note).toContain('by hand');
  });

  it('rounds only the end sections of a joined top', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const joined: Benchtop = { ...top, joins: [mm(400)] };
    const slabs = buildBenchtop(joined, p).panels.filter((x) => x.role === 'benchtop');
    expect(slabs).toHaveLength(2);
    // The first section is square at both ends: its right-hand edge is a join, not a corner.
    expect(isRectangular(slabs[0]!.profile)).toBe(true);
    expect(isRectangular(slabs[1]!.profile)).toBe(false);
  });
});

/**
 * What actually reaches the screen.
 *
 * §5.1's two rendering bugs are the reason this is here rather than assumed. Both times the model
 * was correct throughout and the cutlist never lied; a curved part drew dead flat because
 * `isRectangular` took a fallback, and only looking at the thing caught it. The suite passed
 * either way, because the suite was asking the model.
 *
 * So: take the mesh the viewport would build and measure it against the true radius. A slab is
 * flat and unformed, so it goes through `extrudeProfile` rather than `formedMesh` — a different
 * path from the one that broke, which is exactly why it is worth checking rather than assuming.
 */
describe('the mesh the viewport draws', () => {
  it('follows the real arc, not a chord across it', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const slab = byName(buildBenchtop(top, p).panels, 'Benchtop');
    const mesh = extrudeProfile(slab.profile, mm(18));

    // Every vertex in the rounded quarter has to sit on or inside the 200mm arc about (700, 200),
    // and the corner it replaces — (900, 0) — must not be in the mesh at all.
    const corner = { x: 700, y: 200 };
    // A micron. Loose enough for an arc point found through a centre and a radius — the same
    // reason `profileBounds` snaps — and four orders of magnitude tighter than any real error.
    const tolerance = 1e-3;
    let onTheArc = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!;
      // extrudeProfile lays part x,y into mesh x,y with thickness on z.
      const y = mesh.positions[i + 1]!;
      if (x < corner.x || y > corner.y) continue;
      const d = Math.hypot(x - corner.x, y - corner.y);
      expect(d).toBeLessThanOrEqual(200 + tolerance);
      if (Math.abs(d - 200) < tolerance) onTheArc += 1;
    }
    // A flat fallback would put the square corner back and leave nothing on the curve.
    expect(onTheArc).toBeGreaterThan(2);
  });
});

/*
 * ── What it refuses, and how ─────────────────────────────────────────────────────────────────
 */

describe('a radius the top cannot hold', () => {
  /**
   * §4.5's crash, in a different file: a number field fires on every keystroke, so "2000" arrives
   * as "2" and then "20" and then "200" on its way through. Every one of them has to draw.
   */
  it('draws every keystroke on the way to a number', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    for (const typed of [1, 2, 5, 20, 200, 579, 580, 581, 2000, 20000]) {
      const t: Benchtop = { ...top, corners: { left: 0, right: mm(typed) } };
      expect(() => buildBenchtop(t, p)).not.toThrow();
      expect(buildBenchtop(t, p).panels.length).toBeGreaterThan(0);
    }
  });

  it('cuts the corner square and says so, rather than throwing', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const tooBig: Benchtop = { ...top, corners: { left: 0, right: mm(2000) } };
    const built = buildBenchtop(tooBig, p);
    expect(isRectangular(byName(built.panels, 'Benchtop').profile)).toBe(true);
    expect(built.warnings.join(' ')).toContain('only 900mm');
  });

  /** Two radii that each fit on their own and do not fit together. */
  it('catches a pair that overlaps along the front', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const both: Benchtop = { ...top, corners: { left: mm(500), right: mm(500) } };
    expect(buildBenchtop(both, p).warnings.join(' ')).toContain('1000mm');
  });

  it('reports a waterfall at a rounded corner rather than guessing the join', () => {
    const [p, top] = withTop(runWith(RIGHT_200));
    const waterfall: Benchtop = { ...top, ends: { left: 'wall', right: 'waterfall' } };
    expect(buildBenchtop(waterfall, p).warnings.join(' ')).toContain('not modelled');
  });
});

/*
 * ── Measuring and charging ───────────────────────────────────────────────────────────────────
 */

describe('what a rounded corner is worth', () => {
  const stone = (corners: Benchtop['corners']): Benchtop =>
    ({
      id: 't',
      name: 'Top',
      fromCabinetIds: [],
      placement: { anchor: { x: 0, y: 870, z: 0 }, yawDeg: 0 },
      length: mm(3000),
      carcassDepth: mm(560),
      materialId: 'stone-quartz-20',
      overhangs: { front: mm(20), back: mm(0), left: mm(0), right: mm(0) },
      ends: { left: 'wall', right: 'wall' },
      corners,
      joins: [],
      cutouts: [],
    }) as Benchtop;

  /**
   * A rounded corner is **shorter** than the square one it replaces, not longer. Charging the
   * square corner over-buys the edge profile by r(2 − π/2) — 86mm on a 200 radius, which on a
   * stone top is real money on a per-metre rate.
   */
  it('swaps two radii of straight edge for the arc', () => {
    expect(finishedEdgeLength(stone(SQUARE_BENCHTOP_CORNERS))).toBe(3000);
    // 3000 − 200 + π·200/2. The end is walled, so it contributes nothing either way.
    expect(finishedEdgeLength(stone({ left: 0, right: mm(200) }))).toBeCloseTo(3114.159265, 6);
  });

  it('takes the radius off a finished end as well as off the front', () => {
    const t = stone({ left: 0, right: mm(200) });
    const exposed: Benchtop = { ...t, ends: { left: 'wall', right: 'exposed' } };
    // The walled figure, plus 580 of end, less the 200 the curve ate off it.
    expect(finishedEdgeLength(exposed)).toBeCloseTo(3114.159265 + 580 - 200, 6);
  });

  /**
   * The two halves of "how long is the finished edge" have to agree.
   *
   * A **bought-in** top is charged per metre off `finishedEdgeLength`, which is arithmetic on the
   * model. A **shop-made** one is banded off `profileEdgeLengths`, which measures the real
   * boundary of the part that gets cut. Two places computing the same thing is two places that
   * can disagree, and the disagreement would be a stone quote and a banding order differing by
   * the length of an arc nobody would think to check.
   *
   * Stated for a run ending in a 300 radius: 1600 of straight front, a quarter of a 300 circle,
   * and 280 of end left after the curve has eaten 300 of it.
   */
  it('agrees with what the part is actually banded to', () => {
    const p0 = runWith(RIGHT_300, mm(1900));
    const [p, top] = withTop(p0);
    const slab = byName(buildBenchtop(top, p).panels, 'Benchtop');
    const edges = profileEdgeLengths(slab.profile);

    const longhand = 1600 + (Math.PI * 300) / 2 + 280;
    expect(longhand).toBeCloseTo(2351.238898, 6);
    // The banded edges of the part: the front, and the exposed end.
    expect(edges.L1 + edges.W2).toBeCloseTo(longhand, 6);
    // And the figure a fabricator would be charged from, off the model alone.
    expect(finishedEdgeLength(top)).toBeCloseTo(longhand, 6);
    expect(Object.keys(slab.edgeBanding).sort()).toEqual(['L1', 'W2']);
  });

  it('deducts the corner offcut from the slab area', () => {
    const square = benchtopPlanArea(stone(SQUARE_BENCHTOP_CORNERS));
    const rounded = benchtopPlanArea(stone({ left: 0, right: mm(200) }));
    expect(square - rounded).toBeCloseTo(8584.073464, 6);
  });
});

/*
 * ── Nothing already saved moves ──────────────────────────────────────────────────────────────
 */

describe('the v24 migration', () => {
  it('gives every saved top a square corner, and cuts it exactly as before', () => {
    const [p, top] = withTop(runWith({}));
    const before = buildCutlist(p);

    // A v23 file is this one with the field taken back off.
    const { corners: _dropped, ...withoutCorners } = top;
    const old = {
      ...p,
      schemaVersion: 23,
      benchtops: [withoutCorners],
    } as unknown as Record<string, unknown>;

    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.benchtops[0]!.corners).toEqual(SQUARE_BENCHTOP_CORNERS);
    expect(buildCutlist(migrated)).toEqual(before);
  });
});

/*
 * ── The primitive on its own ─────────────────────────────────────────────────────────────────
 */

describe('roundedCornerProfile', () => {
  it('is the plain rectangle when nothing is rounded', () => {
    expect(isRectangular(roundedCornerProfile(mm(600), mm(400), {}))).toBe(true);
    expect(isRectangular(roundedCornerProfile(mm(600), mm(400), { x0y0: mm(0) }))).toBe(true);
  });

  /** All four, so the corner naming is pinned rather than inferred from the one caller. */
  it('rounds each named corner in its own quarter', () => {
    const r = mm(50);
    const centres: Record<string, [number, number]> = {
      x0y0: [50, 50],
      x1y0: [550, 50],
      x1y1: [550, 350],
      x0y1: [50, 350],
    };
    for (const [corner, [cx, cy]] of Object.entries(centres)) {
      const profile = roundedCornerProfile(mm(600), mm(400), { [corner]: r });
      const arc = polygonEdges(profile.outline).find((e) => e.bulge !== 0)!;
      const g = arcGeometry(arc.from, arc.to, arc.bulge);
      expect([corner, g.centre.x, g.centre.y]).toEqual([corner, cx, cy]);
      expect(g.sweep).toBeCloseTo(Math.PI / 2, 9);
    }
  });

  it('keeps the bounding box, whatever is rounded', () => {
    const all = roundedCornerProfile(mm(600), mm(400), {
      x0y0: mm(40),
      x1y0: mm(60),
      x1y1: mm(80),
      x0y1: mm(100),
    });
    expect(profileExtent(all)).toEqual({ length: 600, width: 400 });
    const offcuts = [40, 60, 80, 100].reduce((s, r) => s + (1 - Math.PI / 4) * r * r, 0);
    expect(profileArea(all)).toBeCloseTo(600 * 400 - offcuts, 6);
  });

  it('throws on a radius the rectangle cannot hold — the level above must check first', () => {
    expect(() => roundedCornerProfile(mm(600), mm(400), { x0y0: mm(500) })).toThrow();
    expect(() =>
      roundedCornerProfile(mm(600), mm(400), { x0y0: mm(350), x1y0: mm(350) }),
    ).toThrow();
  });
});
