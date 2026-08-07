/**
 * The drawing pack — paper, scale, and what goes on the floor plan sheet.
 *
 * ## The standard this file holds to
 *
 * A drawing is a **measuring instrument**. A client puts a rule on a sheet marked 1:50 and reads
 * a number off it, so the assertions here are not that the sheet looks reasonable — they are that
 * the paper tells the truth:
 *
 *   - the scale in the title block is the scale the geometry is drawn at
 *   - every dimension's figure matches the two points it is drawn between
 *   - every figure comes off the model, so a fault in the drawing cannot move the number with it
 *   - the drawing, **including its dimensions**, fits inside the frame
 *
 * Reference figures, hand-calculated:
 *   A3 landscape          420 × 297 paper mm
 *   less 10mm margins     400 × 277
 *   less a 32mm title block → frame 400 × 245
 *   a 4000 × 3000 room at 1:20 → 200 × 150 paper mm, which fits
 *   the same room at 1:10  → 400 × 300, which does not (300 > 245)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  A3,
  A4,
  DRAWING_SCALES,
  fitScale,
  layoutSheet,
  onPaper,
  scaleOf,
  toPaper,
} from '../src/core/export/sheet.ts';
import { dimensionIsHonest } from '../src/core/export/dimension.ts';
import { elevationMarkers, planSheetContent } from '../src/core/export/planSheet.ts';
import { elevationOfWall, elevationsFor } from '../src/core/export/elevation.ts';
import { createCabinet, createEmptyProject, resetIdCounter } from '../src/core/project/factory.ts';
import { startPlan, appendWall, closePlan, setWallLength } from '../src/core/project/plan.ts';
import { generateBenchtops } from '../src/core/project/generate.ts';
import { placeAgainstWall } from '../src/core/project/wallPlacement.ts';
import type { Project } from '../src/core/model/project.ts';

let project: Project;
beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Drawing test');
});

describe('paper and frame', () => {
  it('turns A3 landscape into a frame the drawing may occupy', () => {
    const sheet = layoutSheet(A3, 'landscape');
    expect([sheet.width, sheet.height]).toEqual([420, 297]);
    expect([sheet.frame.width, sheet.frame.height]).toEqual([400, 245]);
    // The frame starts inside the margin and the title block takes the strip below it.
    expect([sheet.frame.x, sheet.frame.y]).toEqual([10, 10]);
    expect(sheet.frame.y + sheet.frame.height + sheet.titleBlockHeight + sheet.margin).toBe(297);
  });

  it('turns the paper on its side for portrait', () => {
    const sheet = layoutSheet(A3, 'portrait');
    expect([sheet.width, sheet.height]).toEqual([297, 420]);
  });
});

describe('scale', () => {
  /*
   * The assertion the whole sheet rests on. A drawing whose stated scale is not its applied
   * scale is worse than one with no scale on it, because it invites a measurement that will be
   * wrong — and it is wrong most convincingly for the person least able to check it.
   */
  it('states the scale it actually draws at', () => {
    const scale = scaleOf(50);
    expect(scale.label).toBe('1:50');
    // A 3000mm wall at 1:50 is 60mm of paper. Nothing else is an acceptable answer.
    expect(onPaper(mm(3000), scale)).toBe(60);
    // And the transform is built from the same number the label came from.
    const p = toPaper({ x: 3000, z: 0 }, { x: 0, z: 0 }, scale, { x: mm(10), y: mm(10) });
    expect(p.x).toBe(70); // 10mm frame origin + 60mm of drawing
  });

  it('only ever picks a scale a rule can be laid on', () => {
    const sheet = layoutSheet(A3, 'landscape');
    for (const w of [500, 1200, 3000, 4800, 6000, 9000, 14000, 24000]) {
      const scale = fitScale({ width: mm(w), height: mm(w * 0.7) }, sheet.frame);
      if (scale) expect(DRAWING_SCALES).toContain(scale.denominator);
    }
  });

  it('picks the tightest scale that fits, not the safest', () => {
    const sheet = layoutSheet(A3, 'landscape'); // frame 400 × 245
    // 4000 × 3000 fits at 1:20 (200 × 150) but not at 1:10 (400 × 300, and 300 > 245).
    expect(fitScale({ width: mm(4000), height: mm(3000) }, sheet.frame)?.denominator).toBe(20);
  });

  it('refuses rather than inventing a scale that fits', () => {
    // A hall 60m long is not going on an A4 at any honest ratio on the ladder.
    const tiny = layoutSheet(A4, 'portrait');
    expect(fitScale({ width: mm(60000), height: mm(40000) }, tiny.frame)).toBeNull();
  });

  it('never returns a scale whose drawing overflows the frame', () => {
    const sheet = layoutSheet(A3, 'landscape');
    for (const w of [1000, 2500, 4000, 5500, 8000, 12000, 20000]) {
      const content = { width: mm(w), height: mm(w * 0.65) };
      const scale = fitScale(content, sheet.frame);
      if (!scale) continue;
      expect(onPaper(content.width, scale)).toBeLessThanOrEqual(sheet.frame.width);
      expect(onPaper(content.height, scale)).toBeLessThanOrEqual(sheet.frame.height);
    }
  });
});

/**
 * A closed rectangular room, walls given real lengths.
 *
 * The walk is three runs and a close: 4000 east, turn 90 and go 3000, turn 90 and go 4000, then
 * `closePlan` puts in the fourth to bring it back to the start. Turns are **relative** — the API
 * takes `turnDeg`, not a bearing.
 */
const rectRoom = (widthMm: number, depthMm: number): Project => {
  let room = startPlan(project.room, { length: mm(widthMm) });
  room = appendWall(room, { length: mm(depthMm), turnDeg: 90 });
  room = appendWall(room, { length: mm(widthMm), turnDeg: 90 });
  room = closePlan(room);
  return { ...project, room };
};

describe('the floor plan sheet', () => {
  it('measures the room from the model, not off the drawing', () => {
    const p = rectRoom(4000, 3000);
    const content = planSheetContent(p);
    // Every dimension on the sheet, whatever it measures, agrees with its own endpoints.
    for (const d of content.dimensions) {
      expect(dimensionIsHonest(d)).toBe(true);
    }
    const overall = content.dimensions.filter((d) => d.kind === 'overall');
    expect(overall.map((d) => Math.round(d.value)).sort((a, b) => a - b)).toEqual([3000, 4000]);
  });

  it('gives every wall its length', () => {
    const p = rectRoom(4000, 3000);
    const walls = planSheetContent(p).dimensions.filter((d) => d.kind === 'wall');
    expect(walls).toHaveLength(p.room.walls.length);
    expect(walls.map((d) => Math.round(d.value)).sort((a, b) => a - b)).toEqual([
      3000, 3000, 4000, 4000,
    ]);
  });

  it('follows the model when a wall is retyped', () => {
    // The dimension is a claim about the kitchen, so changing the kitchen has to change it.
    const p = rectRoom(4000, 3000);
    const first = p.room.walls[0]!;
    const retyped = { ...p, room: setWallLength(p.room, first.id, mm(5200)) };
    const before = planSheetContent(p).dimensions.find((d) => d.kind === 'wall')!;
    const after = planSheetContent(retyped).dimensions.find((d) => d.kind === 'wall')!;
    expect(Math.round(before.value)).toBe(4000);
    expect(Math.round(after.value)).toBe(5200);
    expect(dimensionIsHonest(after)).toBe(true);
  });

  it('leaves room on the paper for the dimensions, not just the room', () => {
    // The failure this catches looks like a styling problem and is arithmetic: a frame sized to
    // the walls alone crops the overall dimension off the edge of the sheet.
    const p = rectRoom(4000, 3000);
    const content = planSheetContent(p);
    expect(content.width).toBeGreaterThan(4000);
    expect(content.height).toBeGreaterThan(3000);
    for (const d of content.dimensions) {
      for (const end of [d.a, d.b]) {
        const x = end.x + d.offset.x * d.distance;
        const z = end.y + d.offset.y * d.distance;
        expect(x).toBeGreaterThanOrEqual(content.extents.minX - 0.5);
        expect(x).toBeLessThanOrEqual(content.extents.maxX + 0.5);
        expect(z).toBeGreaterThanOrEqual(content.extents.minZ - 0.5);
        expect(z).toBeLessThanOrEqual(content.extents.maxZ + 0.5);
      }
    }
  });
});

describe('cabinets on the plan', () => {
  /** A base cabinet standing on a wall, `along` from its start corner. */
  const onWall = (p: Project, wallIndex: number, along: number, width: number, name: string) => {
    const wall = p.room.walls[wallIndex]!;
    const placement = placeAgainstWall(p.room, { wallId: wall.id, along: mm(along), offset: mm(0) }, mm(0));
    const cabinet = createCabinet(
      { typeId: 'base', name, width: mm(width), x: mm(0) },
      p.defaults,
      p.constructions,
    );
    return { ...cabinet, placement: placement ?? cabinet.placement };
  };

  it('dimensions each cabinet by its own stored width', () => {
    let p = rectRoom(4000, 3000);
    p = {
      ...p,
      cabinets: [onWall(p, 0, 0, 600, 'B1 Sink'), onWall(p, 0, 600, 900, 'B2 Pots')],
    };
    const dims = planSheetContent(p).dimensions.filter((d) => d.kind === 'cabinet');
    expect(dims.map((d) => Math.round(d.value))).toEqual([600, 900]);
    for (const d of dims) expect(dimensionIsHonest(d)).toBe(true);
  });

  it('orders a run along the wall, not by the order cabinets were added', () => {
    let p = rectRoom(4000, 3000);
    // Added right-to-left on purpose.
    p = {
      ...p,
      cabinets: [onWall(p, 0, 1500, 450, 'B3'), onWall(p, 0, 0, 600, 'B1'), onWall(p, 0, 600, 900, 'B2')],
    };
    const dims = planSheetContent(p).dimensions.filter((d) => d.kind === 'cabinet');
    expect(dims.map((d) => Math.round(d.value))).toEqual([600, 900, 450]);
  });
});

describe('elevation markers', () => {
  const withCabinet = (p: Project, wallIndex: number) => {
    const wall = p.room.walls[wallIndex]!;
    const placement = placeAgainstWall(p.room, { wallId: wall.id, along: mm(0), offset: mm(0) }, mm(0));
    const cabinet = createCabinet(
      { typeId: 'base', name: `B${wallIndex}`, width: mm(600), x: mm(0) },
      p.defaults,
      p.constructions,
    );
    return { ...cabinet, placement: placement ?? cabinet.placement };
  };

  it('letters only the walls that have something to draw', () => {
    let p = rectRoom(4000, 3000);
    p = { ...p, cabinets: [withCabinet(p, 0), withCabinet(p, 2)] };
    const markers = elevationMarkers(p.room, p.cabinets);
    // Two walls carry cabinets; the other two have no elevation to key to.
    expect(markers.map((m) => m.key)).toEqual(['A', 'B']);
    expect(markers.map((m) => m.wallId)).toEqual([p.room.walls[0]!.id, p.room.walls[2]!.id]);
  });

  it('gives a marker to no wall at all on an empty job', () => {
    // A marker pointing at a sheet that does not exist is a broken promise on the paper.
    expect(elevationMarkers(rectRoom(4000, 3000).room, [])).toEqual([]);
  });

  it('stands the marker in the room and points it back at its wall', () => {
    let p = rectRoom(4000, 3000);
    p = { ...p, cabinets: [withCabinet(p, 0)] };
    const marker = elevationMarkers(p.room, p.cabinets)[0]!;
    const wall = p.room.walls[0]!;
    const mid = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.y + wall.end.y) / 2 };
    // It floats off the wall...
    expect(Math.hypot(marker.at.x - mid.x, marker.at.y - mid.z)).toBeCloseTo(520, 3);
    // ...and looking along `look` from the marker gets you back to the wall, not further away.
    const walked = {
      x: marker.at.x + marker.look.x * 520,
      z: marker.at.y + marker.look.y * 520,
    };
    expect(Math.hypot(walked.x - mid.x, walked.z - mid.z)).toBeLessThan(1);
  });

  it('letters in wall order so they run round the room', () => {
    let p = rectRoom(4000, 3000);
    p = { ...p, cabinets: [withCabinet(p, 3), withCabinet(p, 1), withCabinet(p, 0)] };
    const markers = elevationMarkers(p.room, p.cabinets);
    expect(markers.map((m) => m.key)).toEqual(['A', 'B', 'C']);
    expect(markers.map((m) => m.wallId)).toEqual([
      p.room.walls[0]!.id,
      p.room.walls[1]!.id,
      p.room.walls[3]!.id,
    ]);
  });
});

/*
 * ── Elevations ─────────────────────────────────────────────────────────────
 *
 * The assertion that matters most here is that the drawing is **not mirrored**. Getting the
 * horizontal direction backwards produces a sheet where every unit is the right size, every
 * dimension reads correctly, and the sink is at the wrong end of the kitchen — the same
 * right-part-wrong-place failure §7 exists to catch, in its most convincing form.
 *
 * So the elevations are checked against `along`, which is what the floor plan dimensions and the
 * wall snapping already use: a cabinet 1500 along a wall must appear 1500 from the left of that
 * wall's elevation, and one at 0 must be to the left of it.
 */
describe('elevations', () => {
  const bases = (p: Project, wallIndex: number, spec: { along: number; width: number; name: string }[]) => {
    const wall = p.room.walls[wallIndex]!;
    return spec.map((s) => {
      const cabinet = createCabinet(
        { typeId: 'base', name: s.name, width: mm(s.width), x: mm(0) },
        p.defaults,
        p.constructions,
      );
      // Stand it at the height `createCabinet` chose — for a base that is the top of its kick.
      // Placing it at y=0 would bury the kick, which is a different (and real) drawing.
      const placement = placeAgainstWall(
        p.room,
        { wallId: wall.id, along: mm(s.along), offset: mm(0) },
        cabinet.placement.anchor.y,
      );
      return { ...cabinet, placement: placement ?? cabinet.placement };
    });
  };

  it('puts the wall start on the left, not the right', () => {
    let p = rectRoom(4000, 3000);
    p = { ...p, cabinets: bases(p, 0, [
      { along: 0, width: 600, name: 'B1 Left' },
      { along: 1500, width: 900, name: 'B2 Right' },
    ]) };
    const elev = elevationOfWall(p, p.room.walls[0]!, 'A');
    const outlines = elev.items.filter((i) => i.kind === 'carcass').sort((a, b) => a.u0 - b.u0);
    expect(outlines.map((o) => o.label)).toEqual(['B1', 'B2']);
    // And they sit where the plan says they do — u IS `along`, with no flip.
    expect(outlines[0]!.u0).toBeCloseTo(0, 3);
    expect(outlines[1]!.u0).toBeCloseTo(1500, 3);
    expect(outlines[1]!.u1).toBeCloseTo(2400, 3);
  });

  it('is not mirrored on a wall running the other way', () => {
    // The North wall runs opposite to the South one, so if anything flips, it flips here.
    let p = rectRoom(4000, 3000);
    p = { ...p, cabinets: bases(p, 2, [
      { along: 0, width: 600, name: 'B1 Left' },
      { along: 1500, width: 900, name: 'B2 Right' },
    ]) };
    const elev = elevationOfWall(p, p.room.walls[2]!, 'B');
    const outlines = elev.items.filter((i) => i.kind === 'carcass').sort((a, b) => a.u0 - b.u0);
    expect(outlines.map((o) => o.label)).toEqual(['B1', 'B2']);
    expect(outlines[0]!.u0).toBeCloseTo(0, 3);
    expect(outlines[1]!.u0).toBeCloseTo(1500, 3);
  });

  it('measures height off the floor, with the kick standing on it', () => {
    let p = rectRoom(4000, 3000);
    p = { ...p, cabinets: bases(p, 0, [{ along: 0, width: 600, name: 'B1' }]) };
    const elev = elevationOfWall(p, p.room.walls[0]!, 'A');
    const kick = elev.items.find((i) => i.kind === 'kick')!;
    expect(kick.v0).toBeCloseTo(0, 3); // on the floor
    // The carcass starts at the top of the kick and the unit finishes at bench height.
    const carcass = elev.items.find((i) => i.kind === 'carcass')!;
    expect(carcass.v0).toBeGreaterThan(0);
    expect(Math.round(carcass.v1)).toBe(870); // 150 kick + 720 carcass
  });

  it('draws the fronts the cabinet is actually built with', () => {
    // A drawer bank's fronts come from the rule engine, so a bank whose heights were set by hand
    // draws what it will be cut to — not a re-derived guess at where a front ought to be.
    let p = rectRoom(4000, 3000);
    const wall = p.room.walls[0]!;
    const bank = createCabinet(
      { typeId: 'drawer-bank', name: 'D1 Pots', width: mm(600), x: mm(0) },
      p.defaults,
      p.constructions,
    );
    const placement = placeAgainstWall(
      p.room,
      { wallId: wall.id, along: mm(0), offset: mm(0) },
      bank.placement.anchor.y,
    );
    p = {
      ...p,
      cabinets: [{
        ...bank,
        placement: placement ?? bank.placement,
        options: { ...bank.options, drawerFrontHeights: [mm(400), mm(155), mm(156)] },
      }],
    };
    const elev = elevationOfWall(p, wall, 'A');
    const fronts = elev.items.filter((i) => i.kind === 'front').sort((a, b) => a.v0 - b.v0);
    expect(fronts).toHaveLength(3);
    expect(fronts.map((f) => Math.round(f.v1 - f.v0))).toEqual([400, 155, 156]);
  });

  it('measures every figure honestly', () => {
    let p = rectRoom(4000, 3000);
    p = { ...p, cabinets: bases(p, 0, [
      { along: 0, width: 600, name: 'B1' },
      { along: 600, width: 900, name: 'B2' },
    ]) };
    const elev = elevationOfWall(p, p.room.walls[0]!, 'A');
    for (const d of elev.dimensions) expect(dimensionIsHonest(d)).toBe(true);
    const widths = elev.dimensions.filter((d) => d.kind === 'cabinet');
    expect(widths.map((d) => Math.round(d.value))).toEqual([600, 900]);
    // And the run's overall figure spans both.
    const overall = elev.dimensions.find((d) => d.kind === 'overall')!;
    expect(Math.round(overall.value)).toBe(1500);
  });

  it('takes its letters from the plan markers, so a marker cannot point at the wrong sheet', () => {
    let p = rectRoom(4000, 3000);
    p = {
      ...p,
      cabinets: [
        ...bases(p, 2, [{ along: 0, width: 600, name: 'B9' }]),
        ...bases(p, 0, [{ along: 0, width: 600, name: 'B1' }]),
      ],
    };
    const markers = elevationMarkers(p.room, p.cabinets);
    const elevations = elevationsFor(p, markers);
    expect(elevations.map((e) => e.key)).toEqual(markers.map((m) => m.key));
    expect(elevations.map((e) => e.wallId)).toEqual(markers.map((m) => m.wallId));
  });

  it('leaves room on the paper for its dimensions', () => {
    let p = rectRoom(4000, 3000);
    p = { ...p, cabinets: bases(p, 0, [{ along: 0, width: 600, name: 'B1' }]) };
    const elev = elevationOfWall(p, p.room.walls[0]!, 'A');
    for (const d of elev.dimensions) {
      for (const end of [d.a, d.b]) {
        const u = end.x + d.offset.x * d.distance;
        const v = end.y + d.offset.y * d.distance;
        expect(u).toBeGreaterThanOrEqual(elev.extents.minU - 0.5);
        expect(u).toBeLessThanOrEqual(elev.extents.maxU + 0.5);
        expect(v).toBeGreaterThanOrEqual(elev.extents.minV - 0.5);
        expect(v).toBeLessThanOrEqual(elev.extents.maxV + 0.5);
      }
    }
  });
});

/*
 * A drawing's job is to show what the model says, including when the model is wrong.
 *
 * This started as a mistake in the test above — cabinets placed at y=0 rather than at the top of
 * their kick — and the elevation reported the kick 150mm underground, which is exactly what a
 * cabinet standing 150mm too low looks like. That is worth an assertion of its own: a sheet that
 * quietly clamped it to the floor line would hide a real setting-out error behind a tidy drawing,
 * and the bench would find it on site.
 */
describe('an elevation shows the job as modelled, faults included', () => {
  it('draws a cabinet placed below the floor below the floor', () => {
    const p0 = rectRoom(4000, 3000);
    const wall = p0.room.walls[0]!;
    const cabinet = createCabinet(
      { typeId: 'base', name: 'B1 Sunk', width: mm(600), x: mm(0) },
      p0.defaults,
      p0.constructions,
    );
    // Forced onto the floor, so its kick has nowhere to go but underground.
    const sunk = {
      ...cabinet,
      placement:
        placeAgainstWall(p0.room, { wallId: wall.id, along: mm(0), offset: mm(0) }, mm(0)) ??
        cabinet.placement,
    };
    const elev = elevationOfWall({ ...p0, cabinets: [sunk] }, wall, 'A');
    const kick = elev.items.find((i) => i.kind === 'kick')!;
    expect(Math.round(kick.v0)).toBe(-150);
    // And the sheet makes room for it rather than cropping it at the floor line.
    expect(elev.extents.minV).toBeLessThanOrEqual(-150);
  });
});

/*
 * The heights up the side of an elevation.
 *
 * These are read off what is drawn — the top of the benchtop, the top of the tallest unit — and
 * never off a bench-height setting. A shop that stands a run on a plinth, or builds one to a
 * client's own height, has to dimension as it is rather than as the standards say it should be.
 */
describe('elevation height dimensions', () => {
  /** A run with a shop-made top over it, so there is a real benchtop to measure to. */
  const withBenchtop = (p: Project): Project => {
    const tops = generateBenchtops(p, 'shopmade-hmr-mdf-18');
    return { ...p, benchtops: [...p.benchtops, ...tops] };
  };

  const runOnWall = (p: Project): Project => {
    const wall = p.room.walls[0]!;
    const cabinet = createCabinet(
      { typeId: 'base', name: 'B1 Sink', width: mm(900), x: mm(0) },
      p.defaults,
      p.constructions,
    );
    return {
      ...p,
      cabinets: [
        {
          ...cabinet,
          placement:
            placeAgainstWall(
              p.room,
              { wallId: wall.id, along: mm(0), offset: mm(0) },
              cabinet.placement.anchor.y,
            ) ?? cabinet.placement,
        },
      ],
    };
  };

  it('measures to the top of the benchtop that is actually there', () => {
    const p = withBenchtop(runOnWall(rectRoom(4000, 3000)));
    const elev = elevationOfWall(p, p.room.walls[0]!, 'A');
    const tops = elev.items.filter((i) => i.kind === 'benchtop');
    expect(tops.length).toBeGreaterThan(0);

    const benchTop = Math.max(...tops.map((t) => t.v1));
    const heights = elev.dimensions.filter((d) => d.kind === 'height');
    expect(heights.length).toBeGreaterThan(0);
    // The figure is the drawn benchtop's own top edge, not a standards number.
    expect(Math.round(heights[0]!.value)).toBe(Math.round(benchTop));
    // 150 kick + 720 carcass + 18 top = 888, so it is emphatically not the nominal 900.
    expect(Math.round(benchTop)).toBe(888);
    for (const d of heights) expect(dimensionIsHonest(d)).toBe(true);
  });

  it('follows the run when the cabinets are built taller', () => {
    let p = runOnWall(rectRoom(4000, 3000));
    p = { ...p, cabinets: p.cabinets.map((c) => ({ ...c, height: mm(800) })) };
    p = withBenchtop(p);
    const elev = elevationOfWall(p, p.room.walls[0]!, 'A');
    const heights = elev.dimensions.filter((d) => d.kind === 'height');
    // 150 + 800 + 18.
    expect(Math.round(heights[0]!.value)).toBe(968);
  });
});
