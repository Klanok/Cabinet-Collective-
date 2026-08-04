/**
 * Custom features on an individual part — §5.12, hand-calculated.
 *
 * Asked for from the bench: *"I need to be able edit individual parts to add custom grooves and
 * cut outs to them — so say I add a drawer bank and want to do a cut out in the left hand end"*.
 *
 * ## The reference cabinet
 *
 * A drawer bank, 600 × 720 × 560, on the shipped Australian construction (16mm carcass, applied
 * 16mm back). Its two sides come out 720 × 544 — `544 = 560 − 16`, the depth less the back — and
 * **their part axes run opposite ways**, which is the whole reason this feature is stated from
 * named edges:
 *
 * ```
 *   Side L   u = +Y  v = +Z   origin (0, 0, 16)     part +y runs toward the FRONT
 *   Side R   u = +Y  v = −Z   origin (600, 0, 560)  part +y runs toward the BACK
 * ```
 *
 * So *"250 up from the bottom, 100 in from the front"* is:
 *
 * ```
 *   Side L    x = 250            y = 544 − 100 = 444
 *   Side R    x = 250            y = 100
 * ```
 *
 * Both are the same hole in the same place in the cabinet. Written as a part-space `y = 100` it
 * would be 100 from the front on one side and 100 from the **back** on the other — the same
 * diameter, the same count, on a part of exactly the right size. That is §4.6's mounting plate
 * and §4.4's former axis again, and it is what these tests are pointed at.
 *
 * ## The three kinds, and what each does to the blank
 *
 * ```
 *   hole     Ø50 through          feature   blank unchanged: 720 × 544
 *   groove   6 × 8 in a face      feature   blank unchanged
 *   notch    20 deep off an edge  PROFILE   corner bite: area −2000mm², blank unchanged
 *                                           whole edge:  720 × 524, and the blank with it
 * ```
 *
 * A corner notch not changing the blank is the honest answer, not an omission: a panel saw still
 * cuts the whole rectangle and the bite comes out of it afterwards. §4.8 — *a nest is of blanks,
 * not of shapes*.
 *
 * ## The full-edge notch, longhand
 *
 * 20mm off the **back** edge of Side L, the full 720 of it — a pipe running up the wall. The part
 * goes 720 × 544 → 720 × 524, and because part space starts at the bounding box, the profile is
 * slid back onto its own origin and **the placement is slid the same distance in the cabinet**:
 *
 * ```
 *   before   z ∈ [16, 560]        after   z ∈ [36, 560]
 * ```
 *
 * Move one without the other and the board is in the wrong place at the right size.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import type { Cabinet } from '../src/core/model/cabinet.ts';
import type { Project } from '../src/core/model/project.ts';
import type { CustomFeature } from '../src/core/model/partFeature.ts';
import {
  type CutoutFeature,
  type GrooveFeature,
  type PanelFeature,
} from '../src/core/model/feature.ts';
import { panelArea, panelDrawingProfile } from '../src/core/model/panel.ts';
import { arcGeometry } from '../src/core/geom/arc.ts';
import { extrudeProfile } from '../src/core/geom/extrude.ts';
import { profileArea, profileExtent } from '../src/core/geom/profile.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { nestProject } from '../src/core/nest/nest.ts';
import { buildCutlist } from '../src/core/cutlist/cutlist.ts';
import { type CamSetup, projectPrograms } from '../src/core/cam/operations.ts';
import { setupFor } from '../src/core/post/post.ts';
import { KDT_NESTING_ROUTER } from '../src/core/library/machines.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import { byName, occupies, size } from './helpers.ts';

let project: Project;

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Custom features');
});

/** The reference drawer bank, with whatever features are being tried on it. */
const bank = (customFeatures: readonly CustomFeature[], overrides: Partial<Cabinet> = {}) => {
  const cabinet: Cabinet = {
    ...createCabinet(
      {
        typeId: 'drawer-bank',
        name: 'D1',
        width: mm(600),
        height: mm(720),
        depth: mm(560),
        x: mm(0),
      },
      project.defaults,
      project.constructions,
    ),
    ...overrides,
    customFeatures,
  };
  return { built: buildCabinet(cabinet, { ...project, cabinets: [cabinet] }), cabinet };
};

/** A job of one cabinet, so the nest, the cutlist and CAM can be asked about it. */
const jobOf = (cabinet: Cabinet): Project => ({ ...project, cabinets: [cabinet] });

const WASTE_HOLE: CustomFeature = {
  id: 'cf-waste',
  kind: 'hole',
  part: 'side-left',
  at: [
    { from: 'bottom', at: mm(250) },
    { from: 'front', at: mm(100) },
  ],
  diameter: mm(50),
};

const cutoutsOf = (features: readonly PanelFeature[]): CutoutFeature[] =>
  features.filter((f): f is CutoutFeature => f.kind === 'cutout');

const groovesOf = (features: readonly PanelFeature[]): GrooveFeature[] =>
  features.filter((f): f is GrooveFeature => f.kind === 'groove');

// ── A hole through a named part ──────────────────────────────────────────────────────────

describe('a round hole through a panel', () => {
  it('lands where two named edges put it', () => {
    const { built } = bank([WASTE_HOLE]);
    expect(built.warnings).toEqual([]);

    const side = byName(built.panels, 'Side L');
    const holes = cutoutsOf(side.features);
    expect(holes.length).toBe(1);
    expect(holes[0]!.purpose).toBe('custom');

    const bounds = profileExtent({ outline: holes[0]!.outline, holes: [] });
    expect(bounds.length).toBeCloseTo(50, 6);
    expect(bounds.width).toBeCloseTo(50, 6);

    const centre = centreOf(holes[0]!);
    expect(centre.x).toBeCloseTo(250, 6);
    // 544 deep, 100 in from the front.
    expect(centre.y).toBeCloseTo(444, 6);
  });

  it('is the mirror image of itself on the other hand, from the same sentence', () => {
    const { built } = bank([
      WASTE_HOLE,
      { ...WASTE_HOLE, id: 'cf-waste-r', part: 'side-right' },
    ]);
    expect(built.warnings).toEqual([]);

    const left = centreOf(cutoutsOf(byName(built.panels, 'Side L').features)[0]!);
    const right = centreOf(cutoutsOf(byName(built.panels, 'Side R').features)[0]!);

    // Same height up the cabinet…
    expect(right.x).toBeCloseTo(left.x, 6);
    // …and the opposite way along the part, which is the same place in the room.
    expect(right.y).toBeCloseTo(100, 6);
    expect(left.y + right.y).toBeCloseTo(544, 6);
  });

  it('reaches the machine as a real circle, cut on the inside of the line', () => {
    const { cabinet } = bank([WASTE_HOLE]);
    const setup: CamSetup = setupFor(KDT_NESTING_ROUTER);
    const programs = projectPrograms(forRouter(jobOf(cabinet)), setup);

    const contour = programs
      .flatMap((p) => p.operations)
      .find((op) => op.kind === 'contour' && op.purpose === 'custom');
    expect(contour).toBeDefined();
    if (contour?.kind !== 'contour') throw new Error('not a contour');
    expect(contour.closed).toBe(true);

    // Ø50 hole, Ø6 cutter: the tool runs a 22mm radius, three millimetres *inside* the line.
    // Offsetting it outward like a perimeter would cut it Ø62 — a waste that rattles.
    const arcs = contour.path
      .map((v, i) => ({ v, next: contour.path[(i + 1) % contour.path.length]! }))
      .filter((e) => e.v.bulge !== undefined && e.v.bulge !== 0)
      .map((e) => arcGeometry(e.v, e.next, e.v.bulge!));
    expect(arcs.length).toBe(4);
    for (const arc of arcs) expect(arc.radius).toBeCloseTo(22, 6);
  });

  it('does not change the blank the nester reserves', () => {
    const plain = bank([]);
    const holed = bank([WASTE_HOLE]);
    expect(size(byName(holed.built.panels, 'Side L'))).toEqual(
      size(byName(plain.built.panels, 'Side L')),
    );
    // Nor the part's own area: the board it is cut from is the same board, and a hole in the
    // middle of it is machining rather than shape.
    expect(panelArea(byName(holed.built.panels, 'Side L'))).toBeCloseTo(
      panelArea(byName(plain.built.panels, 'Side L')),
      6,
    );

    const blankOf = (job: Project, name: string) => {
      const nest = nestProject(job);
      const panel = byName(buildCabinet(job.cabinets[0]!, job).panels, name);
      for (const material of nest.byMaterial) {
        for (const sheet of material.sheets) {
          const placed = sheet.placements.find((p) => p.partId === panel.id);
          if (placed) return [placed.at.length, placed.at.width] as const;
        }
      }
      throw new Error(`${name} was not nested`);
    };
    expect(blankOf(jobOf(holed.cabinet), 'Side L')).toEqual(blankOf(jobOf(plain.cabinet), 'Side L'));
  });

  it('shows as a hole in the 3D view rather than as a mark on a solid panel', () => {
    const { built } = bank([WASTE_HOLE]);
    const side = byName(built.panels, 'Side L');
    const drawing = panelDrawingProfile(side);
    expect(drawing.holes.length).toBe(1);

    // Checked by measuring the mesh rather than by looking at it: the triangles of one face have
    // to add up to the area of the board *less* the hole. A hole that failed to cut would come out
    // at the full 391,680mm² and look perfectly convincing in a screenshot.
    const mesh = extrudeProfile(drawing, mm(16));
    const capArea = faceArea(mesh, 16);
    // What is missing from the face is the hole: π × 25² = 1963mm². Within half a percent,
    // because a drawn circle is a run of chords and every chord cuts the corner off its own arc —
    // it comes out 0.24% small at the tolerance the renderer flattens to. That approximation is
    // allowed here and nowhere that decides a dimension.
    const missing = 720 * 544 - capArea;
    expect(missing).toBeGreaterThan(Math.PI * 625 * 0.995);
    expect(missing).toBeLessThan(Math.PI * 625 * 1.005);
    expect(capArea).toBeCloseTo(profileArea(drawing), -1);
  });
});

// ── A notch off an edge or a corner ──────────────────────────────────────────────────────

describe('a notch off an edge', () => {
  const SCRIBE: CustomFeature = {
    id: 'cf-scribe',
    kind: 'notch',
    part: 'side-left',
    edge: 'back',
    depth: mm(20),
    length: mm(100),
    from: { from: 'bottom', at: mm(0) },
  };

  it('takes a bite out of the part rather than adding machining to it', () => {
    const { built } = bank([SCRIBE]);
    expect(built.warnings).toEqual([]);

    const side = byName(built.panels, 'Side L');
    expect(side.features.filter((f) => f.purpose === 'custom')).toEqual([]);
    // 720 × 544 less a 100 × 20 corner = 389,680mm².
    expect(panelArea(side)).toBeCloseTo(720 * 544 - 100 * 20, 6);
    expect(side.profile.outline.length).toBe(6);
  });

  it('leaves the blank alone when it is a corner bite, because a saw cuts the rectangle anyway', () => {
    const { built } = bank([SCRIBE]);
    expect(size(byName(built.panels, 'Side L'))).toEqual([720, 544]);
  });

  it('changes the blank when it takes a whole edge, and moves the board with it', () => {
    const { built, cabinet } = bank([{ ...SCRIBE, length: mm(720) }]);
    expect(built.warnings).toEqual([]);

    const side = byName(built.panels, 'Side L');
    // 20 off the back of a 544 deep side.
    expect(size(side)).toEqual([720, 524]);
    // And the part is still where it physically is: the 20mm has gone off the *back*, so the
    // side now starts at z = 36 instead of z = 16 and still finishes at the front.
    expect(occupies(side, project).z).toEqual([36, 560]);
    expect(occupies(side, project).x).toEqual([0, 16]);

    // The nester reserves the smaller blank — this is the half of §5.12 that the split between
    // profile and feature exists for.
    const nest = nestProject(jobOf(cabinet));
    const placed = nest.byMaterial
      .flatMap((m) => m.sheets)
      .flatMap((s) => s.placements)
      .find((p) => p.partId === side.id);
    expect(placed).toBeDefined();
    expect(Math.min(placed!.at.length, placed!.at.width)).toBeCloseTo(524, 6);
  });

  it('comes out a plain rectangle again when it has taken a whole edge', () => {
    const { built } = bank([{ ...SCRIBE, length: mm(720) }]);
    // Four corners, not six with two of them redundant — otherwise a second notch would be
    // refused on a part that is a plain rectangle.
    expect(byName(built.panels, 'Side L').profile.outline.length).toBe(4);
  });

  it('is the mirror image of itself on the other hand', () => {
    const { built } = bank([SCRIBE, { ...SCRIBE, id: 'cf-scribe-r', part: 'side-right' }]);
    expect(built.warnings).toEqual([]);
    const left = byName(built.panels, 'Side L');
    const right = byName(built.panels, 'Side R');

    // Both notches are at the back of the cabinet and on the floor, which is where a skirting is.
    for (const side of [left, right]) {
      const box = occupies(side, project);
      expect(box.y[0]).toBe(0);
      expect(panelArea(side)).toBeCloseTo(720 * 544 - 100 * 20, 6);
    }
    // The two profiles are *not* identical rings — the bite is on the other part-space edge.
    const yOf = (p: typeof left) => p.profile.outline.map((v) => v.y).filter((y) => y > 0 && y < 544);
    expect(yOf(left)).toEqual([20, 20]);
    expect(yOf(right)).toEqual([524, 524]);
  });

  it('is cut out by the router as part of the perimeter, not as a second operation', () => {
    const { cabinet } = bank([SCRIBE]);
    const programs = projectPrograms(forRouter(jobOf(cabinet)), setupFor(KDT_NESTING_ROUTER));
    const perimeters = programs
      .flatMap((p) => p.operations)
      .filter((op) => op.purpose === 'perimeter' && op.kind === 'contour');
    // Ten corners in the offset path of a six-cornered part: four outside corners each pick up a
    // cutter-radius arc, the notch's two outside corners do the same, and its two inside corners
    // stay points. A notched side is in there somewhere and nothing else in this cabinet is.
    expect(perimeters.some((op) => op.kind === 'contour' && op.path.length > 8)).toBe(true);
  });
});

// ── A groove or rebate in a face ─────────────────────────────────────────────────────────

describe('a groove in a face', () => {
  const DADO: CustomFeature = {
    id: 'cf-dado',
    kind: 'groove',
    part: 'side-left',
    face: 'right',
    edge: 'back',
    offset: mm(50),
    width: mm(6),
    depth: mm(8),
  };

  it('runs where a fence would be set, on the face that was named', () => {
    const { built } = bank([DADO]);
    expect(built.warnings).toEqual([]);

    const grooves = groovesOf(byName(built.panels, 'Side L').features);
    expect(grooves.length).toBe(1);
    const groove = grooves[0]!;
    // Side L's A-face looks toward +X, which is the inside of the cabinet.
    expect(groove.face).toBe('A');
    expect(groove.width).toBe(6);
    expect(groove.depth).toBe(8);

    // 50 in from the back to the near side, so the centreline — which is what a cutter follows —
    // is at 53. Full height, because no run was given.
    expect(groove.path.map((p) => [p.x, p.y])).toEqual([
      [0, 53],
      [720, 53],
    ]);
  });

  it('turns over with the part, so the same sentence cuts the inside of both sides', () => {
    const { built } = bank([DADO, { ...DADO, id: 'cf-dado-r', part: 'side-right' }]);
    const left = groovesOf(byName(built.panels, 'Side L').features)[0]!;
    const right = groovesOf(byName(built.panels, 'Side R').features)[0]!;

    // The right-hand side's inner face is its B-face — `w = u × v` decides that, not a choice.
    expect(left.face).toBe('A');
    expect(right.face).toBe('B');
    // And the groove is the same 50 from the back of the cabinet on both.
    expect(left.path[0]!.y + right.path[0]!.y).toBeCloseTo(544, 6);
  });

  it('takes a run when it is not meant to go all the way', () => {
    const { built } = bank([
      { ...DADO, run: { from: { from: 'bottom', at: mm(100) }, length: mm(300) } },
    ]);
    expect(built.warnings).toEqual([]);
    const groove = groovesOf(byName(built.panels, 'Side L').features)[0]!;
    expect(groove.path.map((p) => p.x)).toEqual([100, 400]);
  });

  it('is a rebate when the offset is zero, and is machined rather than reported', () => {
    const { built, cabinet } = bank([{ ...DADO, offset: mm(0) }]);
    expect(built.warnings).toEqual([]);
    const groove = groovesOf(byName(built.panels, 'Side L').features)[0]!;
    // Hard against the back edge: 0 to 6, centreline 3.
    expect(groove.path[0]!.y).toBeCloseTo(3, 6);

    const programs = projectPrograms(forRouter(jobOf(cabinet)), setupFor(KDT_NESTING_ROUTER));
    const cut = programs
      .flatMap((p) => p.operations)
      .find((op) => op.kind === 'contour' && op.purpose === 'custom');
    expect(cut).toBeDefined();
    if (cut?.kind !== 'contour') throw new Error('not a contour');
    expect(cut.closed).toBe(false);
    expect(cut.depth).toBe(8);
  });

  it('is reported rather than cut undersize when it is wider than the cutter', () => {
    const { cabinet } = bank([{ ...DADO, width: mm(12) }]);
    const programs = projectPrograms(forRouter(jobOf(cabinet)), setupFor(KDT_NESTING_ROUTER));
    const warnings = programs.flatMap((p) => p.warnings);
    // §4.9's own limit, reached by a route nothing else in the codebase could reach before: a
    // 12mm groove needs more than one pass with a 6mm cutter, and that is not worked out.
    expect(warnings.some((w) => w.includes('Cut it on the saw'))).toBe(true);
  });
});

// ── It survives the cabinet being edited ─────────────────────────────────────────────────

describe('a feature stated from named edges', () => {
  it('stays where it was put when the cabinet gets deeper', () => {
    const deeper = bank([WASTE_HOLE], { depth: mm(660) });
    const side = byName(deeper.built.panels, 'Side L');
    // 660 − 16 = 644 deep now, and the hole is still 100 in from the front.
    expect(size(side)).toEqual([720, 644]);
    expect(centreOf(cutoutsOf(side.features)[0]!).y).toBeCloseTo(544, 6);
    expect(centreOf(cutoutsOf(side.features)[0]!).x).toBeCloseTo(250, 6);
  });

  it('stays where it was put when the cabinet gets taller', () => {
    const taller = bank([WASTE_HOLE], { height: mm(900) });
    const side = byName(taller.built.panels, 'Side L');
    expect(size(side)).toEqual([900, 544]);
    // Measured up from the bottom, so it does not move.
    expect(centreOf(cutoutsOf(side.features)[0]!).x).toBeCloseTo(250, 6);
    expect(centreOf(cutoutsOf(side.features)[0]!).y).toBeCloseTo(444, 6);
  });

  it('follows the part when the drawer count changes it', () => {
    const front: CustomFeature = {
      id: 'cf-front',
      kind: 'hole',
      part: 'fronts',
      index: 0,
      at: [
        { from: 'bottom', at: mm(80) },
        { from: 'left', at: mm(100) },
      ],
      diameter: mm(30),
    };
    const three = bank([front], { options: { drawerCount: 3 } });
    expect(three.built.warnings).toEqual([]);
    const bottomFront = byName(three.built.panels, 'Drawer front 1');
    // A drawer front lies with its length across the bank: u = +X, v = +Y.
    expect(centreOf(cutoutsOf(bottomFront.features)[0]!)).toEqual({ x: 100, y: 80 });
    // And only the one it was put on.
    expect(cutoutsOf(byName(three.built.panels, 'Drawer front 2').features)).toEqual([]);
  });

  it('goes on every part a rule makes when no one of them was named', () => {
    const all: CustomFeature = {
      id: 'cf-vent',
      kind: 'hole',
      part: 'fronts',
      at: [
        { from: 'bottom', at: mm(80) },
        { from: 'left', at: mm(100) },
      ],
      diameter: mm(30),
    };
    const { built } = bank([all]);
    const holed = built.panels.filter((p) => cutoutsOf(p.features).length > 0);
    expect(holed.map((p) => p.name)).toEqual([
      'Drawer front 1',
      'Drawer front 2',
      'Drawer front 3',
      'Drawer front 4',
    ]);
  });
});

// ── Nothing throws ───────────────────────────────────────────────────────────────────────

describe('a feature that cannot be built', () => {
  const problemsFrom = (feature: CustomFeature): readonly string[] => bank([feature]).built.warnings;

  it('reports a hole that runs off the part, and builds the cabinet anyway', () => {
    const { built } = bank([{ ...WASTE_HOLE, diameter: mm(400) }]);
    expect(built.panels.length).toBeGreaterThan(10);
    expect(cutoutsOf(byName(built.panels, 'Side L').features)).toEqual([]);
    expect(built.warnings.length).toBe(1);
    expect(built.warnings[0]).toContain('runs off the edge');
    expect(built.warnings[0]).toContain('Not applied');
  });

  it('reports a part this cabinet does not build, and lists the ones it does', () => {
    const warnings = problemsFrom({ ...WASTE_HOLE, part: 'shelves' });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('does not build');
    expect(warnings[0]).toContain('side-left');
    expect(warnings[0]).toContain('fronts');
  });

  it('reports a part number that is no longer built', () => {
    const warnings = problemsFrom({ ...WASTE_HOLE, part: 'fronts', index: 9 });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('no. 10');
  });

  it('reports a measurement taken from a face rather than an edge', () => {
    // The left of a left-hand side panel is the board's own face. There is no edge there to
    // measure from, and guessing which one was meant is how a hole ends up on the wrong axis.
    const warnings = problemsFrom({
      ...WASTE_HOLE,
      at: [
        { from: 'bottom', at: mm(250) },
        { from: 'left', at: mm(100) },
      ],
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('face of the board, not an edge');
    expect(warnings[0]).toContain('front');
  });

  it('reports two measurements taken across the same direction', () => {
    const warnings = problemsFrom({
      ...WASTE_HOLE,
      at: [
        { from: 'front', at: mm(100) },
        { from: 'back', at: mm(100) },
      ],
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('right angles');
  });

  it('reports a groove that would go right through the board', () => {
    const warnings = problemsFrom({
      id: 'cf-deep',
      kind: 'groove',
      part: 'side-left',
      face: 'right',
      edge: 'back',
      offset: mm(50),
      width: mm(6),
      depth: mm(20),
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('goes right through');
  });

  it('reports a notch that would take the whole part', () => {
    const warnings = problemsFrom({
      id: 'cf-big',
      kind: 'notch',
      part: 'side-left',
      edge: 'back',
      depth: mm(600),
      length: mm(100),
      from: { from: 'bottom', at: mm(0) },
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('the whole');
  });

  it('reports a notch that runs off the end of the part', () => {
    const warnings = problemsFrom({
      id: 'cf-long',
      kind: 'notch',
      part: 'side-left',
      edge: 'back',
      depth: mm(20),
      length: mm(200),
      from: { from: 'bottom', at: mm(600) },
    });
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('runs off');
  });

  it('never throws, whatever it is handed', () => {
    const nonsense: CustomFeature[] = [
      { ...WASTE_HOLE, diameter: mm(0) },
      { ...WASTE_HOLE, diameter: mm(-50) },
      { ...WASTE_HOLE, part: 'nothing-like-a-part' },
      { id: 'a', kind: 'notch', part: 'bottom', edge: 'front', depth: mm(0), length: mm(0), from: { from: 'left', at: mm(0) } },
      { id: 'b', kind: 'groove', part: 'back', face: 'front', edge: 'top', offset: mm(-5), width: mm(0), depth: mm(0) },
    ];
    for (const feature of nonsense) {
      expect(() => bank([feature])).not.toThrow();
      // And the cabinet still comes out whole, which is what the warning is *for*.
      expect(bank([feature]).built.panels.length).toBeGreaterThan(10);
    }
  });

  it('survives a radius being typed one digit at a time, on the part being notched', () => {
    // The §4.5 lesson: a number field fires on every keystroke, so "250" arrives as 2, then 25.
    for (const at of [2, 25, 250, 2500]) {
      expect(() =>
        bank([{ ...WASTE_HOLE, at: [{ from: 'bottom', at: mm(at) }, { from: 'front', at: mm(100) }] }]),
      ).not.toThrow();
    }
  });
});

// ── What a spec says it can carry ────────────────────────────────────────────────────────

describe('a type that cuts no parts', () => {
  it('refuses a custom feature in its own words', () => {
    const space: Cabinet = {
      ...createCabinet(
        { typeId: 'appliance', name: 'DW', width: mm(600), height: mm(720), depth: mm(560), x: mm(0) },
        project.defaults,
        project.constructions,
      ),
      customFeatures: [{ ...WASTE_HOLE, part: 'side-left' }],
    };
    const built = buildCabinet(space, { ...project, cabinets: [space] });
    expect(built.panels).toEqual([]);
    expect(built.warnings.some((w) => w.includes('cuts no parts'))).toBe(true);
  });
});

// ── The cutlist ──────────────────────────────────────────────────────────────────────────

describe('the cutlist', () => {
  it('prints the cutout beside the part it is on', () => {
    const { cabinet } = bank([WASTE_HOLE]);
    const line = buildCutlist(jobOf(cabinet)).find((l) => l.name === 'Side L');
    expect(line).toBeDefined();
    expect(line!.note).toContain('Ø50 hole');
    expect(line!.note).toContain('from the front');
  });

  it('does not collapse a notched part onto the same line as a plain one', () => {
    // Both sides are 720 × 544 and the notch does not change that, so nothing about the *size*
    // tells them apart. Grouping on size alone would print "2 × Side" and one of them would be
    // cut wrong.
    const both = bank([
      {
        id: 'cf-scribe',
        kind: 'notch',
        part: 'side-left',
        edge: 'back',
        depth: mm(20),
        length: mm(100),
        from: { from: 'bottom', at: mm(0) },
      },
    ]);
    const lines = buildCutlist(jobOf(both.cabinet)).filter((l) => l.name.startsWith('Side'));
    expect(lines.map((l) => l.quantity)).toEqual([1, 1]);
  });

  it('leaves the grouping of a job with no notches in it exactly as it was', () => {
    const plain = bank([]);
    const withHole = bank([WASTE_HOLE]);
    expect(buildCutlist(jobOf(withHole.cabinet)).length).toBe(
      buildCutlist(jobOf(plain.cabinet)).length,
    );
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

/** The centre of a circular cutout, read back off the ring rather than off the feature. */
const centreOf = (cutout: CutoutFeature): { x: number; y: number } => {
  const xs = cutout.outline.map((v) => v.x);
  const ys = cutout.outline.map((v) => v.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
};

/** Area of the triangles on one face of a mesh, measured in the plane of that face. */
const faceArea = (
  mesh: { positions: Float32Array; indices: Uint32Array },
  z: number,
): number => {
  let total = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const p = [0, 1, 2].map((k) => {
      const at = mesh.indices[i + k]! * 3;
      return { x: mesh.positions[at]!, y: mesh.positions[at + 1]!, z: mesh.positions[at + 2]! };
    });
    if (p.some((v) => Math.abs(v.z - z) > 1e-6)) continue;
    total += Math.abs(
      ((p[1]!.x - p[0]!.x) * (p[2]!.y - p[0]!.y) - (p[2]!.x - p[0]!.x) * (p[1]!.y - p[0]!.y)) / 2,
    );
  }
  return total;
};

/** A job nested for a router — a 6mm cutter and an edge trim to run it in. */
const forRouter = (p: Project): Project => ({
  ...p,
  settings: {
    ...p.settings,
    nesting: { ...p.settings.nesting, kerf: mm(6), sheetEdgeTrim: mm(6) },
  },
});
