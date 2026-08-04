/**
 * Phases 4 and 5 — the operation list, and the G-code written from it.
 *
 * **What these tests can and cannot prove**, because the difference matters more here than
 * anywhere else in the suite. They prove the *geometry*: a hole is where the model says, a part is
 * offset by exactly the cutter's radius, an arc reaches the machine as an arc and bows the right
 * way, the order is safe. They cannot prove the *dialect* — whether this controller wants `G81` or
 * explicit plunges, whether Z zero is the material or the table. That comes off a program the
 * machine already runs, and until one has been compared against this, the output is a draft.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ## The offset, longhand
 *
 * A 500 × 300 part cut out with a 6mm bit. The tool runs a **radius** outside the finished edge, so
 * its centreline traces:
 *
 *   length   500 + 2 × 3   = 506
 *   width    300 + 2 × 3   = 306
 *
 * and each corner becomes a quarter-circle of radius 3 about the original corner, because a round
 * tool swinging round an outside corner cannot leave it square. Cut this path with the cutter
 * *on the line* and the part comes out 6mm oversize on both axes; cut the part outline with no
 * offset at all and it comes out 6mm undersize. Both are a whole sheet.
 *
 * ## The flip, and why it is the dangerous one
 *
 * A door's hinge cups are bored on its **B-face** (§2), so a door is laid on the bed back-up.
 * Turning a part over mirrors it: a cup 22.5mm from the left edge of the part is 22.5mm from the
 * **right** edge as the machine looks down at it. Get that backwards and every handed part in the
 * job is bored on the wrong end — same holes, same diameters, same count, and it passes any test
 * that counts them. This is §4.4's former axis and §4.6's mounting plate for the third time, which
 * is why `tests/helpers.ts` grew `occupies` and why the assertions below are about coordinates.
 *
 * Reference, for a 447 × 717 door laid at the sheet origin with a 6mm trim:
 *
 *   cup at part x = 22.5, laid B-face up  →  sheet x = 6 + (447 − 22.5) = 430.5
 *   the same cup laid A-face up           →  sheet x = 6 + 22.5         = 28.5
 *
 * ## The two settings that are saw figures
 *
 * `kerf` ships at 3.2mm (a saw blade) and `sheetEdgeTrim` at 0. Both are wrong for a router and
 * neither is guessable from the other:
 *
 *   kerf 3.2, cutter 6   →  the toolpath between two parts is 2.8mm wider than the gap,
 *                           so it takes 1.4mm off each neighbour, on every shared edge
 *   trim 0,   cutter 6   →  a part on the sheet edge has to be cut from 3mm outside itself,
 *                           and 3mm outside the sheet edge there is no sheet
 *
 * ## Onion skin and overcut are exclusive
 *
 * 16mm board, 0.5mm overcut, 0.2mm onion skin. Applying both gives 16 + 0.5 − 0.2 = 16.3, which is
 * *past* the underside — a clean through cut with a smaller overcut, and every small part loose
 * under the spindle. Leaving material means never reaching the underside at all: 16 − 0.2 = 15.8.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { v2 } from '../src/core/geom/vec.ts';
import { type Vertex2, arcGeometry } from '../src/core/geom/arc.ts';
import { quarterDiscProfile, rectProfile } from '../src/core/geom/profile.ts';
import { offsetRingOutward } from '../src/core/cam/offset.ts';
import {
  type Lay,
  faceToLayUp,
  layReversesHandedness,
  partPointToSheet,
  partRingToSheet,
} from '../src/core/cam/sheetSpace.ts';
import { type CamSetup, perimeterDepth, projectPrograms } from '../src/core/cam/operations.ts';
import { orderOperations } from '../src/core/cam/operation.ts';
import { depthPasses } from '../src/core/post/iso.ts';
import { zAtDepth, zClearance } from '../src/core/post/machine.ts';
import { checkNestedForRouter } from '../src/core/post/check.ts';
import { postProject, postedTotals, setupFor } from '../src/core/post/post.ts';
import { GENERIC_ISO_ROUTER, KDT_NESTING_ROUTER } from '../src/core/library/machines.ts';
import { nestProject } from '../src/core/nest/nest.ts';
import { buildProject } from '../src/core/rules/build.ts';
import type { Project } from '../src/core/model/project.ts';
import {
  createCabinet,
  createEmptyProject,
  createSampleKitchen,
  resetIdCounter,
} from '../src/core/project/factory.ts';

/**
 * The shipped defaults are already the router's, so these two say which is which explicitly rather
 * than relying on what happens to ship. A test that silently follows a default stops testing the
 * thing it was written for the day somebody changes it.
 */
const forRouter = (p: Project): Project => ({
  ...p,
  settings: {
    ...p.settings,
    nesting: { ...p.settings.nesting, kerf: mm(6), sheetEdgeTrim: mm(6) },
  },
});

/** A job nested for a panel saw — a 3.2mm blade and no edge trim. */
const forSaw = (p: Project): Project => ({
  ...p,
  settings: {
    ...p.settings,
    nesting: { ...p.settings.nesting, kerf: mm(3.2), sheetEdgeTrim: mm(0) },
  },
});

const SETUP: CamSetup = setupFor(KDT_NESTING_ROUTER);

let sample: Project;

beforeEach(() => {
  resetIdCounter();
  sample = forRouter(createSampleKitchen());
});

// ── The offset ───────────────────────────────────────────────────────────────────────────

describe('cutting a part out', () => {
  it('runs the cutter a radius outside a 500 × 300 part', () => {
    const { path, problems } = offsetRingOutward(rectProfile(mm(500), mm(300)).outline, mm(3));
    expect(problems).toEqual([]);

    const xs = path.map((v) => v.x);
    const ys = path.map((v) => v.y);
    expect(Math.min(...xs)).toBeCloseTo(-3, 9);
    expect(Math.max(...xs)).toBeCloseTo(503, 9);
    expect(Math.min(...ys)).toBeCloseTo(-3, 9);
    expect(Math.max(...ys)).toBeCloseTo(303, 9);
    // 506 × 306 of tool centreline for a 500 × 300 part.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(506, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(306, 9);
  });

  it('rounds each outside corner to the cutter, because a round tool cannot cut a square one', () => {
    const { path } = offsetRingOutward(rectProfile(mm(500), mm(300)).outline, mm(3));
    // Four straight edges and four corner arcs.
    expect(path.length).toBe(8);
    const arcs = path.filter((v) => v.bulge !== undefined && v.bulge !== 0);
    expect(arcs.length).toBe(4);
    for (const a of arcs) {
      // tan(90°/4) — a quarter turn.
      expect(a.bulge!).toBeCloseTo(Math.tan(Math.PI / 8), 9);
    }
  });

  it('leaves an offset alone when there is no cutter', () => {
    const ring = rectProfile(mm(500), mm(300)).outline;
    expect(offsetRingOutward(ring, mm(0)).path).toBe(ring);
  });

  it('grows a convex arc by the cutter radius and keeps its sweep', () => {
    const { path, problems } = offsetRingOutward(quarterDiscProfile(mm(200)).outline, mm(3));
    expect(problems).toEqual([]);

    /*
     * Picked by chord, not by bulge. A quarter disc offset outward has *three* 90° arcs in it —
     * the disc's own, and a corner arc at each end where the two straight edges turn — and all
     * three carry the same bulge, because a bulge is tan(sweep/4) and they all sweep 90°. Selecting
     * "the arc with the big bulge" finds a 3mm corner and passes for the wrong reason.
     */
    const arcs = path
      .map((v, i) => ({ v, next: path[(i + 1) % path.length]! }))
      .filter((e) => e.v.bulge !== undefined && e.v.bulge !== 0)
      .map((e) => arcGeometry(e.v, e.next, e.v.bulge!));
    // Four: the disc's own arc, plus a corner at each of the shape's three corners.
    expect(arcs.length).toBe(4);

    const disc = arcs.reduce((a, b) => (a.radius >= b.radius ? a : b));
    // The radius grows by the cutter, and the sweep does not move at all.
    expect(disc.radius).toBeCloseTo(203, 6);
    expect(disc.sweep).toBeCloseTo(Math.PI / 2, 9);
    // The two corners are the cutter's own radius.
    for (const corner of arcs.filter((a) => a !== disc)) {
      expect(corner.radius).toBeCloseTo(3, 6);
    }
  });
});

// ── The flip ─────────────────────────────────────────────────────────────────────────────

describe('laying a part on the bed', () => {
  const door: Lay = {
    at: { x: mm(6), y: mm(6), length: mm(447), width: mm(717) },
    orientation: 'as-cut',
    length: mm(447),
    width: mm(717),
    faceUp: 'B',
  };

  it('mirrors a part laid back-up, and does not when it is laid face-up', () => {
    const cup = v2(22.5, 96);
    expect(partPointToSheet(cup, door).x).toBeCloseTo(6 + 447 - 22.5, 9);
    expect(partPointToSheet(cup, { ...door, faceUp: 'A' }).x).toBeCloseTo(6 + 22.5, 9);
    // The other axis is untouched either way — a flip about the length axis leaves Y alone.
    expect(partPointToSheet(cup, door).y).toBeCloseTo(6 + 96, 9);
  });

  it('says which lays reverse handedness, so arcs and winding follow one rule', () => {
    expect(layReversesHandedness(door)).toBe(true);
    expect(layReversesHandedness({ ...door, faceUp: 'A' })).toBe(false);
    // Turning 90° is a rotation, not a mirror — it does not reverse anything.
    expect(layReversesHandedness({ ...door, faceUp: 'A', orientation: 'turned' })).toBe(false);
  });

  it('keeps a turned part inside the blank the nest reserved for it', () => {
    const turned: Lay = {
      at: { x: mm(100), y: mm(50), length: mm(717), width: mm(447) },
      orientation: 'turned',
      length: mm(447),
      width: mm(717),
      faceUp: 'A',
    };
    for (const p of [v2(0, 0), v2(447, 0), v2(447, 717), v2(0, 717)]) {
      const s = partPointToSheet(p, turned);
      expect(s.x).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(s.x).toBeLessThanOrEqual(100 + 717 + 1e-9);
      expect(s.y).toBeGreaterThanOrEqual(50 - 1e-9);
      expect(s.y).toBeLessThanOrEqual(50 + 447 + 1e-9);
    }
  });

  /**
   * The one that catches a sign error nothing else would.
   *
   * Mirroring a ring negates every bulge; reversing the traversal to put the winding back
   * counter-clockwise negates them again. The two cancel, so the original number carries across —
   * and negating once, which is the obvious thing to write, produces an arc that bows the *other
   * way*. Not a slightly different curve: the complement, cutting through the part.
   *
   * Checked by measuring, not by reading the number back: the arc's centre has to stay on the
   * inside of the shape, which is what "convex" means and what a vertex-position test cannot see.
   */
  it('keeps a mirrored arc bowing the same way round the material', () => {
    const disc = quarterDiscProfile(mm(200));
    const lay: Lay = {
      at: { x: mm(0), y: mm(0), length: mm(200), width: mm(200) },
      orientation: 'as-cut',
      length: mm(200),
      width: mm(200),
      faceUp: 'B',
    };
    const ring = partRingToSheet(disc.outline, lay);

    const i = ring.findIndex((v) => v.bulge !== undefined && v.bulge !== 0);
    expect(i).toBeGreaterThanOrEqual(0);
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const g = arcGeometry(a, b, a.bulge!);

    // A quarter disc mirrored about x = 200 has its centre at (200, 0) instead of (0, 0).
    expect(g.radius).toBeCloseTo(200, 6);
    expect(g.centre.x).toBeCloseTo(200, 6);
    expect(g.centre.y).toBeCloseTo(0, 6);

    // And the ring is still counter-clockwise, so "outside" still means outside to the offset.
    let acc = 0;
    for (let k = 0; k < ring.length; k++) {
      const p = ring[k]!;
      const q = ring[(k + 1) % ring.length]!;
      acc += p.x * q.y - q.x * p.y;
    }
    expect(acc).toBeGreaterThan(0);
  });

  it('lays a part machined on one face with that face up', () => {
    expect(faceToLayUp(new Set(['B'] as const), 0, 12)).toBe('B');
    expect(faceToLayUp(new Set(['A'] as const), 12, 0)).toBe('A');
    // Nothing to reach: laid the way it is drawn, so its cut path is unmirrored.
    expect(faceToLayUp(new Set(), 0, 0)).toBe('A');
    // Both faces: the busier one goes up and the rest is reported, never silently skipped.
    expect(faceToLayUp(new Set(['A', 'B'] as const), 3, 20)).toBe('B');
    expect(faceToLayUp(new Set(['A', 'B'] as const), 20, 3)).toBe('A');
  });
});

// ── Depth ────────────────────────────────────────────────────────────────────────────────

describe('how deep things are cut', () => {
  it('leaves an onion skin instead of reaching the spoilboard, never both', () => {
    // 16mm board, 0.2 left holding the part: 15.8, which never gets through.
    expect(perimeterDepth(mm(16), SETUP)).toBeCloseTo(15.8, 9);
    // With no onion skin the overcut applies instead: 16 + 0.5.
    expect(perimeterDepth(mm(16), { ...SETUP, leaveUncut: mm(0) })).toBeCloseTo(16.5, 9);
  });

  it('steps a deep cut down and lands exactly on the final depth', () => {
    expect(depthPasses(mm(15.8), mm(9))).toEqual([9, 15.8]);
    expect(depthPasses(mm(6), mm(9))).toEqual([6]);
    expect(depthPasses(mm(27), mm(9))).toEqual([9, 18, 27]);
    // The last step is never past what was asked for — a through cut goes exactly as deep as it
    // was told and no further into the bed.
    for (const step of depthPasses(mm(15.8), mm(9))) expect(step).toBeLessThanOrEqual(15.8);
  });
});

// ── Ordering ─────────────────────────────────────────────────────────────────────────────

describe('the order operations happen in', () => {
  it('bores before it cuts, and cuts perimeters last', () => {
    const programs = projectPrograms(sample, SETUP);
    for (const program of programs) {
      const kinds = program.operations.map((op) =>
        op.purpose === 'perimeter' ? 'perimeter' : op.kind,
      );
      const lastBore = kinds.lastIndexOf('bore');
      const firstPerimeter = kinds.indexOf('perimeter');
      if (lastBore >= 0 && firstPerimeter >= 0) {
        // A part that has been cut out is loose. Boring one the vacuum is no longer holding is
        // how a bit breaks and a part becomes a projectile.
        expect(lastBore).toBeLessThan(firstPerimeter);
      }
    }
  });

  it('is stable, so the same job writes the same program every time', () => {
    const a = orderOperations(projectPrograms(sample, SETUP)[0]!.operations);
    const b = orderOperations(projectPrograms(sample, SETUP)[0]!.operations);
    expect(b.map((op) => op.id)).toEqual(a.map((op) => op.id));
  });

  it('groups by tool so a nested sheet is not a hundred tool changes', () => {
    const program = projectPrograms(sample, SETUP)[0]!;
    const bores = program.operations.filter((op) => op.kind === 'bore');
    const runs = bores.reduce<number[]>((acc, op) => {
      const d = (op as { diameter: number }).diameter;
      if (acc[acc.length - 1] !== d) acc.push(d);
      return acc;
    }, []);
    // One run per diameter, not one per hole.
    expect(runs.length).toBe(new Set(bores.map((op) => (op as { diameter: number }).diameter)).size);
  });
});

// ── The safety checks ────────────────────────────────────────────────────────────────────

describe('what the post refuses', () => {
  it('refuses a job nested for a saw, and says both numbers to change', () => {
    const problems = checkNestedForRouter(
      nestProject(forSaw(createSampleKitchen())),
      KDT_NESTING_ROUTER,
    );
    expect(problems.length).toBe(1);
    expect(problems[0]!.severity).toBe('refuse');
    expect(problems[0]!.message).toContain('3.2mm');
    expect(problems[0]!.message).toContain('1.40mm off each of its neighbours');
    expect(problems[0]!.message).toContain('runs off the sheet');
    expect(problems[0]!.message).toContain('6mm');
  });

  it('is happy once the job is nested for the router', () => {
    expect(checkNestedForRouter(nestProject(sample), KDT_NESTING_ROUTER)).toEqual([]);
  });

  it('writes nothing at all for a job it refused', () => {
    const job = postProject(forSaw(createSampleKitchen()), KDT_NESTING_ROUTER);
    expect(job.refused.length).toBeGreaterThan(0);
    // Not "writes it and mentions a problem underneath" — that is a file somebody can send.
    expect(job.sheets.every((s) => s.output === null)).toBe(true);
    expect(postedTotals(job).written).toBe(0);
  });

  it('keeps every move on the bed', () => {
    const job = postProject(sample, KDT_NESTING_ROUTER);
    expect(job.refused).toEqual([]);
    for (const sheet of job.sheets) {
      for (const op of sheet.program.operations) {
        const points = op.kind === 'bore' ? [op.at] : [];
        for (const p of points) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(KDT_NESTING_ROUTER.envelope.x);
          expect(p.y).toBeLessThanOrEqual(KDT_NESTING_ROUTER.envelope.y);
        }
      }
    }
  });

  it('names a hole it has no bit for rather than boring it with the nearest one', () => {
    const noDrills = {
      ...KDT_NESTING_ROUTER,
      tools: KDT_NESTING_ROUTER.tools.filter((t) => !t.toolId.startsWith('drill-')),
    };
    const job = postProject(sample, noDrills);
    expect(job.warnings.some((w) => w.includes('no bit in'))).toBe(true);
    // Still writes the file — the parts can be cut and the holes bored on the borer.
    expect(postedTotals(job).written).toBeGreaterThan(0);
  });
});

// ── End to end ───────────────────────────────────────────────────────────────────────────

describe('the sample kitchen, posted', () => {
  it('writes a program for every sheet, with every hole in it', () => {
    const job = postProject(sample, KDT_NESTING_ROUTER);
    const totals = postedTotals(job);
    expect(totals.sheetCount).toBe(5);
    expect(totals.written).toBe(5);
    // The centred shelf-pin rows keep clear of panel ends, so the combined job has 486 holes.
    // CAM reads those features; it does not invent any.
    expect(totals.boreCount).toBe(486);
    // A plain-slab kitchen is machined on one face per part, so nothing waits for a second setup.
    expect(totals.needsSecondSetup).toEqual([]);
    expect(job.warnings).toEqual([]);
  });

  it('cuts out every part on every sheet', () => {
    const job = postProject(sample, KDT_NESTING_ROUTER);
    const perimeters = job.sheets.flatMap((s) =>
      s.program.operations.filter((op) => op.purpose === 'perimeter'),
    );
    const nest = nestProject(sample);
    const placed = nest.byMaterial.reduce(
      (n, m) => n + m.sheets.reduce((k, s) => k + s.placements.length, 0),
      0,
    );
    expect(perimeters.length).toBe(placed);
  });

  it('sends an arc to the machine as an arc, never as a run of little straight moves', () => {
    const curved: Project = forRouter({
      ...createEmptyProject('Curved'),
      cabinets: [
        createCabinet({
          typeId: 'base',
          name: 'R1',
          width: mm(900),
          height: mm(720),
          depth: mm(560),
          x: mm(0),
          options: { carcassRadius: mm(300), radiusCorner: 'front-right' },
        }),
      ],
    });
    // The cabinet really does have curved parts in it, or this proves nothing.
    const hasArcs = buildProject(curved)
      .flatMap((b) => b.panels)
      .some((p) => p.profile.outline.some((v) => v.bulge !== undefined && v.bulge !== 0));
    expect(hasArcs).toBe(true);

    const job = postProject(curved, KDT_NESTING_ROUTER);
    expect(job.refused).toEqual([]);
    const lines = job.sheets.flatMap((s) => (s.output?.text ?? '').split('\r\n'));
    const arcs = lines.filter((l) => /^G[23] /.test(l));
    expect(arcs.length).toBeGreaterThan(0);
    // Every one carries an incremental centre, so it cannot disagree with its own endpoints.
    for (const a of arcs) expect(a).toMatch(/I-?[\d.]+ J-?[\d.]+/);
  });

  it('says out loud, in the file, that the machine profile is unverified', () => {
    const job = postProject(sample, KDT_NESTING_ROUTER);
    const text = job.sheets[0]!.output!.text;
    expect(text).toContain('UNVERIFIED');
    expect(text).toContain('Simulate or air-cut');
    // And what specifically is a guess, not just that something is. "Z zero" is deliberately no
    // longer on that list — it is the one figure the shop has confirmed.
    expect(text).toContain('Tool change');
    expect(text).toContain('controller');
  });

  it('states the Z datum in the file, because it is the most expensive thing to get wrong', () => {
    /*
     * This used to assert "the TOP of the material", which is what the profile shipped as and what
     * the shop has since corrected — both machines work from the decking sheet up. The header line
     * itself never needed changing: it reads `zDatum` and always said whichever was set. It was
     * this assertion that was pinning the guess in place.
     */
    const job = postProject(sample, KDT_NESTING_ROUTER);
    expect(job.sheets[0]!.output!.text).toContain('Z zero is the TABLE');
  });

  it('writes the same text twice for the same job', () => {
    const a = postProject(forRouter(createSampleKitchen()), KDT_NESTING_ROUTER);
    resetIdCounter();
    const b = postProject(forRouter(createSampleKitchen()), KDT_NESTING_ROUTER);
    expect(b.sheets[0]!.output!.text).toBe(a.sheets[0]!.output!.text);
  });

  it('names the file after the job, the material and the sheet', () => {
    const job = postProject(sample, KDT_NESTING_ROUTER);
    expect(job.sheets[0]!.output!.filename).toBe('sample-kitchen-hmr-white-16-1.nc');
  });

  it('gives the generic profile the same geometry and a different dialect', () => {
    const kdt = postProject(sample, KDT_NESTING_ROUTER);
    const generic = postProject(sample, GENERIC_ISO_ROUTER);
    // Same operations — the machine decides how they are spelled, not what they are.
    expect(generic.sheets[0]!.program.operations.length).toBe(
      kdt.sheets[0]!.program.operations.length,
    );
    expect(kdt.sheets[0]!.output!.text).toContain('G81');
    expect(generic.sheets[0]!.output!.text).not.toContain('G81');
  });
});

describe('a part machined on both faces', () => {
  it('is named rather than half-cut', () => {
    const shaker: Project = { ...sample, defaults: { ...sample.defaults, doorStyleId: 'shaker-57' } };
    const job = postProject(shaker, KDT_NESTING_ROUTER);
    const listed = postedTotals(job).needsSecondSetup;
    // A shaker door is recessed on the show face and bored in the back. One nested program reaches
    // one face, so the doors have to be named — a door that arrives at the bench looking finished
    // and is not is worse than one that never got machined.
    expect(listed.length).toBeGreaterThan(0);
    // And it says so in the file itself, not only in a warning somewhere else.
    const text = job.sheets.map((s) => s.output?.text ?? '').join('\n');
    expect(text).toContain('NOT FINISHED IN THIS PROGRAM');
  });
});

// ── The blank a curve is cut from ────────────────────────────────────────────────────────

describe('a curved part', () => {
  it('is cut out of the blank the nest reserved, arc and all', () => {
    const bowed: Project = forRouter({
      ...createEmptyProject('Bowed'),
      cabinets: [
        createCabinet({
          typeId: 'wall',
          name: 'S1',
          width: mm(900),
          height: mm(720),
          depth: mm(300),
          x: mm(0),
          options: { doorCount: 0, shelfCount: 2, shelfBow: mm(40) },
        }),
      ],
    });
    const job = postProject(bowed, KDT_NESTING_ROUTER);
    expect(job.refused).toEqual([]);
    const nest = nestProject(bowed);

    for (const sheet of job.sheets) {
      const material = nest.byMaterial.find((m) => m.materialId === sheet.program.materialId)!;
      const placements = material.sheets.find((s) => s.index === sheet.program.sheetIndex)!.placements;
      for (const op of sheet.program.operations) {
        if (op.purpose !== 'perimeter' || op.kind !== 'contour') continue;
        const at = placements.find((p) => p.partId === op.partId)!.at;
        // Every point of the cut path is within a cutter radius of the blank the nest reserved —
        // which is what makes a nest and a toolpath describe the same job.
        for (const v of op.path as readonly Vertex2[]) {
          expect(v.x).toBeGreaterThanOrEqual(at.x - 3 - 1e-6);
          expect(v.x).toBeLessThanOrEqual(at.x + at.length + 3 + 1e-6);
          expect(v.y).toBeGreaterThanOrEqual(at.y - 3 - 1e-6);
          expect(v.y).toBeLessThanOrEqual(at.y + at.width + 3 + 1e-6);
        }
      }
    }
  });
});

/*
 * ── Where Z zero is ───────────────────────────────────────────────────────────────────────────
 *
 * **The single most expensive number in the post-processor, and nothing asserted it until now.**
 *
 * It shipped as `material-top` — a guess, flagged as one, chosen on the reasoning that it was the
 * safer way to be wrong. The shop has since confirmed the opposite for both machines:
 *
 * > "With both the KDT and the Woodtron the gcode works from the decking sheet up, that is to say a
 * > Z value of -0.2mm would be cutting 0.2mm into the sacrificial board."
 *
 * So Z0 is the top of the spoilboard. For a 16mm sheet on a machine with a 0.5mm through overcut:
 *
 *     top of the material          0 + 16                         = +16.0
 *     rapid plane                  16 + 20 clearance              = +36.0
 *     a 13mm hinge cup             16 − 13                        =  +3.0
 *     a through contour            16 − (16 + 0.5)                =  −0.5   ← into the spoilboard
 *
 * Every one of those was negative-by-thickness before, which on this machine is a program that cuts
 * air: the contour went to Z−16.5 where the material does not start until Z+16.
 */

describe('Z zero, confirmed from the shop', () => {
  it('is the table on every machine profile the shop cuts on', () => {
    expect(KDT_NESTING_ROUTER.zDatum).toBe('table');
    expect(GENERIC_ISO_ROUTER.zDatum).toBe('table');
  });

  it('puts the rapid plane above the sheet, not above the table', () => {
    // 16 + 20 = 36. On a material-top datum this would be a bare 20 and would rapid *through* it.
    expect(zClearance(KDT_NESTING_ROUTER, 'router', mm(16))).toBe(36);
  });

  it('finishes a through cut just inside the spoilboard, at a small negative Z', () => {
    // 16 − (16 + 0.5) = −0.5, which is the shop's own description of what a negative Z means.
    const through = mm(16 + KDT_NESTING_ROUTER.heads.router.throughOvercut);
    expect(zAtDepth(KDT_NESTING_ROUTER, through, mm(16))).toBeCloseTo(-0.5, 6);
  });

  it('leaves a hinge cup inside the board, well above zero', () => {
    // A 13mm cup in a 16mm door: 16 − 13 = 3mm of board left under it.
    expect(zAtDepth(KDT_NESTING_ROUTER, mm(13), mm(16))).toBe(3);
  });

  it('writes a real program whose cutting Z never goes below the overcut', () => {
    /*
     * The catch-all, and the one that would have caught the original error. Every Z in a real
     * program is read back out of the text: on a table datum nothing may go more than the overcut
     * below zero, because anything that does is cutting the bed rather than the part.
     */
    const programs = postProject(sample, KDT_NESTING_ROUTER).sheets
      .map((s) => s.output)
      .filter((o) => o !== null);
    expect(programs.length).toBeGreaterThan(0);
    const floor = -KDT_NESTING_ROUTER.heads.router.throughOvercut;
    for (const program of programs) {
      const zs = [...program!.text.matchAll(/Z(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      expect(zs.length).toBeGreaterThan(0);
      for (const z of zs) expect(z).toBeGreaterThanOrEqual(floor - 1e-6);
    }
  });
});
