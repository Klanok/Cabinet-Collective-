/**
 * Banquette seating.
 *
 * The first version of this cabinet was rejected at the bench — *"I would never build them as
 * they currently come in"* — and the three faults named there are asserted here directly, because
 * each one passed a suite that only counted parts. A test checking that a front *exists* would
 * not have caught a top that overhangs the unit beside it by 20mm.
 */

import { describe, expect, it } from 'vitest';
import { createCabinet, createEmptyProject } from '../src/core/project/factory.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { mm } from '../src/core/units.ts';
import { isRectangular, profileBounds } from '../src/core/geom/profile.ts';
import { buildHardwareBom } from '../src/core/hardware/bom.ts';
import { STRUCTURAL_DIVIDER_SPAN } from '../src/core/rules/specs/banquette.ts';
import { byName, occupies } from './helpers.ts';
import type { Project } from '../src/core/model/project.ts';
import type { Panel } from '../src/core/model/panel.ts';

const T = 16; // carcass board, as the shipped defaults measure it
const CLEARANCE = 2;

const banquette = (project: Project, width: number, options: Record<string, unknown> = {}) => {
  const base = createCabinet(
    { typeId: 'banquette', name: 'BQ1', width: mm(width), x: mm(0) },
    project.defaults,
    project.constructions,
  );
  const cabinet = { ...base, options: { ...base.options, ...options } };
  return { cabinet, built: buildCabinet(cabinet, project) };
};

const named = (panels: readonly Panel[], name: string): Panel => byName(panels, name);

describe('banquette seating', () => {
  it('builds a solid front and an inset lift-up, and no divider it was not asked for', () => {
    const { cabinet, built } = banquette(createEmptyProject('Banquette'), 1200);

    expect(cabinet.height).toBe(400);
    expect(cabinet.depth).toBe(500);
    expect(built.warnings).toEqual([]);
    expect(built.panels.map((p) => p.name)).toEqual([
      'Side L', 'Side R', 'Bottom', 'Back', 'Front', 'Lift-up',
    ]);
  });

  it('makes the front a false-front in door decor, so a style routes it but nothing bores it', () => {
    const project = createEmptyProject('Front');
    const { built } = banquette(project, 1200);
    const front = named(built.panels, 'Front');

    // Not a door. `boring.ts` selects 'door' and 'drawer-front', so the role is exactly what
    // keeps hinge cups out of a front that does not open.
    expect(front.role).toBe('false-front');
    expect(front.features).toEqual([]);

    // Door decor, not carcass board — it is the face of the unit.
    expect(front.materialId).toBe(project.defaults.doorMaterialId);
  });

  it('puts no hinge on the quote for a front that does not swing', () => {
    const project = createEmptyProject('BOM');
    const { cabinet } = banquette(project, 1200);
    const bom = buildHardwareBom({ ...project, cabinets: [cabinet] });
    expect(bom.filter((line) => /hinge|clip top|plate/i.test(line.name))).toEqual([]);
  });

  it('runs the front grain horizontally, because a seat front is wide and low', () => {
    const { built } = banquette(createEmptyProject('Grain'), 1200);
    const front = named(built.panels, 'Front');
    const box = profileBounds(front.profile);

    // Part length is the front's *width*. A door's length runs up it, and copying that here
    // would stand the grain on end across a 1200 x 397 front.
    expect(box.maxX - box.minX).toBeGreaterThan(box.maxY - box.minY);
    expect(front.grain).toBe('length-along-grain');
  });

  it('insets the lift-up so its top finishes flush with the carcass', () => {
    const project = createEmptyProject('Lift-up');
    const { cabinet, built } = banquette(project, 1200);
    const lift = named(built.panels, 'Lift-up');

    // Carcass board: it lives under a cushion and nothing sees it.
    expect(lift.materialId).toBe(project.defaults.carcassMaterialId);

    // It occupies the top board's worth of the carcass, finishing flush with the top — one
    // flat plane for the cushion to land on, rather than a slab perched above it.
    expect(occupies(lift, project).y).toEqual([cabinet.height - T, cabinet.height]);

    // Clear of the sides all round so it can swing without binding.
    expect(occupies(lift, project).x).toEqual([T + CLEARANCE, cabinet.width - T - CLEARANCE]);
  });

  it('keeps every part inside the carcass footprint — the overhang the bench rejected', () => {
    const project = createEmptyProject('Overhang');
    const { cabinet, built } = banquette(project, 1200);

    // The rejected version's lid came out 1240 x 520 at x = -20: 20mm proud at both ends and
    // the front. Measured as real occupancy, nothing may now stand proud of the carcass —
    // which is also what lets two of them stand side by side, and lets one line up with the
    // inside corner it exists to join. The old lid failed all three at once.
    for (const panel of built.panels) {
      const box = occupies(panel, project);
      expect(box.x[0]).toBeGreaterThanOrEqual(0);
      expect(box.x[1]).toBeLessThanOrEqual(cabinet.width);
      expect(box.z[0]).toBeGreaterThanOrEqual(0);
    }
  });

  it('stands its front off the carcass by exactly as much as a door', () => {
    const project = createEmptyProject('Line-up');
    const { cabinet, built } = banquette(project, 1200);
    const front = named(built.panels, 'Front');

    // A fixed front is still a front, so it takes the same standoff a door does — the hinge gap
    // plus the board. Compared as a standoff rather than as an absolute z, because a banquette
    // is 500 deep and a base cabinet is 560: they finish in the same plane in a room only once
    // each is measured from its own carcass front.
    const base = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(600), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const door = named(buildCabinet(base, project).panels, 'Door L');
    expect(occupies(front, project).z[1] - cabinet.depth).toBe(
      occupies(door, project).z[1] - base.depth,
    );
  });

  it('adds a divider above a 1200 clear span, and not below it', () => {
    const project = createEmptyProject('Span');
    const dividers = (w: number) =>
      banquette(project, w).built.panels.filter((p) => p.role === 'divider').length;

    // The rule reads the clear span, not the nominal width — a 1200 unit is 1168 clear, under it.
    expect(dividers(1200)).toBe(0);
    expect(dividers(STRUCTURAL_DIVIDER_SPAN + 2 * T)).toBe(0);
    expect(dividers(STRUCTURAL_DIVIDER_SPAN + 2 * T + 2)).toBe(1);
    expect(dividers(1800)).toBe(1);
  });

  it('never takes away a divider somebody asked for', () => {
    const { built } = banquette(createEmptyProject('Asked'), 900, { dividerCount: 2 });
    expect(built.panels.filter((p) => p.role === 'divider').length).toBe(2);
  });

  it('refuses a lift-up and a fixed top panel at once — that seals the void', () => {
    const { built } = banquette(createEmptyProject('Sealed'), 1200, { topStyle: 'panel' });
    expect(built.warnings.join(' ')).toContain('sealed');
  });

  it('still takes the constructed rounded corner an ordinary carcass takes', () => {
    const { built } = banquette(createEmptyProject('Curved'), 1200, {
      radiusCorner: 'front-right',
      carcassRadius: mm(250),
    });
    expect(built.panels.some((p) => p.role === 'skin')).toBe(true);
    expect(isRectangular(named(built.panels, 'Bottom').profile)).toBe(false);
  });

  it('ships the requested Warwick Caulfield upholstery choices', () => {
    const project = createEmptyProject('Upholstery');
    expect(project.materials.upholstery?.map((fabric) => fabric.colour)).toEqual([
      'Oatmeal', 'Bone', 'Taupe', 'Rust', 'Moss', 'Pickle', 'Ocean', 'Navy', 'Charcoal',
    ]);
  });
});

/**
 * Per-cabinet grain direction.
 *
 * Asked for from the bench as simply "i dont seem to have an option for grain direction", and the
 * interesting part is the translation rather than the control. A `GrainConstraint` is relative to
 * the **part**, so `length-along-grain` is vertical on a door and horizontal on a drawer front —
 * the same value, opposite directions. Every test here checks a real-world direction on a part
 * whose length runs a known way, because a test that only asserted the enum would pass on the
 * exact bug this translation exists to prevent.
 */
describe('front grain direction, per cabinet', () => {
  const built = (typeId: string, width: number, options: Record<string, unknown>) => {
    const project = createEmptyProject('Grain');
    const base = createCabinet(
      { typeId: typeId as 'base', name: 'C1', width: mm(width), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    return buildCabinet({ ...base, options: { ...base.options, ...options } }, project).panels;
  };

  it('leaves each part to its own shape when nothing is asked for', () => {
    // A door's length runs up it, a drawer front's runs across a bank. Both say the same thing
    // and mean opposite directions, which is exactly why the option is not this enum.
    expect(named(built('base', 600, {}), 'Door L').grain).toBe('length-along-grain');
    expect(named(built('drawer-bank', 600, {}), 'Drawer front 1').grain).toBe('length-along-grain');
  });

  it('runs a door vertical by keeping its length on the grain', () => {
    const door = named(built('base', 600, { grainDirection: 'vertical' }), 'Door L');
    expect(door.placement.u).toBe('+Y'); // length runs up the part
    expect(door.grain).toBe('length-along-grain');
  });

  it('runs a door horizontal by turning the grain across its length', () => {
    const door = named(built('base', 600, { grainDirection: 'horizontal' }), 'Door L');
    expect(door.grain).toBe('width-along-grain');
  });

  it('flips the constraint on a drawer front, whose length runs the other way', () => {
    // The same two requests produce the opposite two values here. If both parts came back with
    // the same constraint, the translation is not happening and one of them is cut wrong.
    const front = (want: string) =>
      named(built('drawer-bank', 600, { grainDirection: want }), 'Drawer front 1');
    expect(front('vertical').placement.u).toBe('+X'); // length runs across the part
    expect(front('vertical').grain).toBe('width-along-grain');
    expect(front('horizontal').grain).toBe('length-along-grain');
  });

  it('gives a door and a drawer front the same real-world grain from one setting', () => {
    // The property the control actually promises: one choice, one direction in the room, across
    // parts whose lengths run at right angles to each other.
    const door = named(built('base', 600, { grainDirection: 'horizontal' }), 'Door L');
    const drawer = named(built('drawer-bank', 600, { grainDirection: 'horizontal' }), 'Drawer front 1');
    expect(door.grain).not.toBe(drawer.grain);
  });

  it('reaches a banquette front, which is a false-front rather than a door', () => {
    const project = createEmptyProject('BQ grain');
    const { built: bq } = banquette(project, 1200, { grainDirection: 'vertical' });
    const front = named(bq.panels, 'Front');
    expect(front.role).toBe('false-front');
    // Its length runs across, so vertical grain has to cross the length.
    expect(front.grain).toBe('width-along-grain');
  });

  it('leaves carcass parts alone — their grain is construction, not preference', () => {
    const panels = built('base', 600, { grainDirection: 'horizontal' });
    expect(named(panels, 'Side L').grain).toBe(named(built('base', 600, {}), 'Side L').grain);
    expect(named(panels, 'Bottom').grain).toBe(named(built('base', 600, {}), 'Bottom').grain);
  });
});
