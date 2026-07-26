/**
 * Directional reveals and gaps, install and delivery charges, tall cabinets, and the v1 → v2
 * migration.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { migrateProject } from '../src/core/model/project.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { costProject } from '../src/core/costing/costing.ts';
import {
  createCabinet,
  createEmptyProject,
  createSampleKitchen,
  resetIdCounter,
} from '../src/core/project/factory.ts';
import type { Project } from '../src/core/model/project.ts';
import { byName, namesOf, occupies, size } from './helpers.ts';

let project: Project;

/** Reference job with clearly different numbers on each axis, so a swap can't hide. */
const withReveals = (
  base: Project,
  revealTopBottom: number,
  revealSides: number,
  gapBetweenDoors: number,
  gapBetweenDrawers: number,
): Project => ({
  ...base,
  constructions: base.constructions.map((c) => ({
    ...c,
    revealTopBottom: mm(revealTopBottom),
    revealSides: mm(revealSides),
    gapBetweenDoors: mm(gapBetweenDoors),
    gapBetweenDrawers: mm(gapBetweenDrawers),
  })),
});

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Test');
});

describe('reveals apply to the edge they name', () => {
  it('takes the top/bottom reveal off height and the side reveal off width', () => {
    // 2mm top and bottom, 5mm at the sides, 4mm between the doors.
    const p = withReveals(project, 2, 5, 4, 3);
    const cabinet = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(900), height: mm(720), depth: mm(560), x: mm(0) },
      p.defaults,
      p.constructions,
    );
    const { panels } = buildCabinet(cabinet, p);

    // Height: 720 − 2×2 = 716. Width: (900 − 2×5 − 4) ÷ 2 = 443.
    expect(size(byName(panels, 'Door L'))).toEqual([716, 443]);

    const left = occupies(byName(panels, 'Door L'), p);
    const right = occupies(byName(panels, 'Door R'), p);
    expect(left.y).toEqual([2, 718]); // top/bottom reveal
    expect(left.x[0]).toBe(5); // side reveal
    expect(900 - right.x[1]).toBe(5);
    expect(right.x[0] - left.x[1]).toBe(4); // gap between the pair
  });

  it('sizes a single door from the side reveal alone', () => {
    const p = withReveals(project, 2, 5, 4, 3);
    const cabinet = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(600), height: mm(720), depth: mm(560), x: mm(0), options: { doorCount: 1 } },
      p.defaults,
      p.constructions,
    );
    const { panels } = buildCabinet(cabinet, p);
    // 600 − 2×5 = 590 wide, 720 − 2×2 = 716 tall.
    expect(size(byName(panels, 'Door'))).toEqual([716, 590]);
  });

  it('uses the drawer gap between stacked fronts, not the door gap', () => {
    const p = withReveals(project, 2, 5, 4, 8);
    const cabinet = createCabinet(
      { typeId: 'drawer-bank', name: 'D1', width: mm(600), height: mm(720), depth: mm(560), x: mm(0), options: { drawerCount: 3 } },
      p.defaults,
      p.constructions,
    );
    const { panels } = buildCabinet(cabinet, p);

    // Width 600 − 2×5 = 590. Opening 720 − 2×2 = 716, less two 8mm gaps = 700, ÷3 = 233⅓.
    expect(size(byName(panels, 'Drawer front 1'))[0]).toBe(590);

    const y1 = occupies(byName(panels, 'Drawer front 1'), p).y;
    const y2 = occupies(byName(panels, 'Drawer front 2'), p).y;
    expect(y1[0]).toBe(2); // bottom reveal
    expect(y2[0] - y1[1]).toBe(8); // drawer gap, not the 4mm door gap
    expect(720 - occupies(byName(panels, 'Drawer front 3'), p).y[1]).toBe(2);
  });

  it('keeps the two reveals genuinely independent', () => {
    const tall = withReveals(project, 10, 1, 3, 3);
    const wide = withReveals(project, 1, 10, 3, 3);
    const make = (p: Project) => {
      const cabinet = createCabinet(
        { typeId: 'base', name: 'B', width: mm(900), height: mm(720), depth: mm(560), x: mm(0) },
        p.defaults,
        p.constructions,
      );
      return size(byName(buildCabinet(cabinet, p).panels, 'Door L'));
    };
    // Swapping which reveal is large must swap which door dimension shrinks.
    expect(make(tall)).toEqual([700, 447.5]); // 720−2×10 tall, (900−2×1−3)/2 wide
    expect(make(wide)).toEqual([718, 438.5]); // 720−2×1 tall, (900−2×10−3)/2 wide
  });
});

describe('tall cabinets', () => {
  const tall = (options = {}, height = mm(2070)) =>
    buildCabinet(
      createCabinet(
        { typeId: 'tall', name: 'T1', width: mm(600), height, depth: mm(560), x: mm(0), options },
        project.defaults,
        project.constructions,
      ),
      project,
    );

  it('takes a full top and a kick, like a pantry', () => {
    const { panels } = tall();
    expect(namesOf(panels)).toContain('Top');
    expect(namesOf(panels)).toContain('Kick');
    expect(namesOf(panels)).not.toContain('Top rail front');
  });

  it('defaults to a sensible pantry size that lines up with the wall cabinets', () => {
    const cabinet = createCabinet(
      { typeId: 'tall', name: 'T1', width: mm(600), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    // 150 kick + 2070 carcass = 2220, level with a wall cabinet at 1500 + 720.
    expect(cabinet.height).toBe(2070);
    expect(cabinet.placement.anchor.y).toBe(150);
    expect(cabinet.placement.anchor.y + cabinet.height).toBe(2220);
  });

  it('runs one full-height door per column by default', () => {
    const { panels } = tall({ doorCount: 2 });
    expect(namesOf(panels).filter((n) => n.startsWith('Door'))).toEqual(['Door L', 'Door R']);
    // 2070 − 2×1.5 tall; (600 − 2×1.5 − 3) ÷ 2 = 297 wide.
    expect(size(byName(panels, 'Door L'))).toEqual([2067, 297]);
  });

  it('splits the doors into an upper and lower bank when asked', () => {
    const { panels } = tall({ doorCount: 2, doorSplitHeight: mm(1200) });
    const names = namesOf(panels).filter((n) => n.startsWith('Door'));
    expect(names).toEqual(['Door lower L', 'Door lower R', 'Door upper L', 'Door upper R']);

    const lower = occupies(byName(panels, 'Door lower L'), project);
    const upper = occupies(byName(panels, 'Door upper L'), project);
    // Break at 1200 with a 3mm gap, half either side.
    expect(lower.y).toEqual([1.5, 1198.5]);
    expect(upper.y).toEqual([1201.5, 2068.5]);
    expect(upper.y[0] - lower.y[1]).toBe(3);
  });

  it('warns about a split that falls outside the carcass', () => {
    expect(tall({ doorSplitHeight: mm(3000) }).warnings.join(' ')).toMatch(/outside the/);
  });

  it('warns when a "tall" cabinet is not tall', () => {
    expect(tall({}, mm(700)).warnings.join(' ')).toMatch(/short for a tall cabinet/);
  });
});

describe('install and delivery', () => {
  it('bills install as its own line, mirroring the shop hours', () => {
    const kitchen = createSampleKitchen();
    const c = costProject(kitchen);

    expect(c.installHours).toBeCloseTo(c.labourMinutes / 60, 9);
    expect(c.installCost).toBe(
      Math.round(c.installHours * kitchen.settings.labour.installRatePerHourExGst * 100),
    );
    expect(c.totalCost).toBe(c.materialCost + c.labourCost + c.installCost);
  });

  it('lets install run on its own rate', () => {
    const kitchen = createSampleKitchen();
    const dearerInstall: Project = {
      ...kitchen,
      settings: {
        ...kitchen.settings,
        labour: { ...kitchen.settings.labour, installRatePerHourExGst: 120 },
      },
    };
    const a = costProject(kitchen);
    const b = costProject(dearerInstall);

    expect(b.installCost).toBeGreaterThan(a.installCost);
    // Shop labour is untouched by the install rate.
    expect(b.labourCost).toBe(a.labourCost);
  });

  it('supports a fixed install allowance instead of mirroring', () => {
    const kitchen = createSampleKitchen();
    const fixed: Project = {
      ...kitchen,
      settings: {
        ...kitchen.settings,
        labour: {
          ...kitchen.settings.labour,
          installHoursMode: 'fixed',
          installFixedHours: 6,
          installRatePerHourExGst: 100,
        },
      },
    };
    const c = costProject(fixed);
    expect(c.installHours).toBe(6);
    expect(c.installCost).toBe(60_000); // 6 h × $100
  });

  it('adds delivery after margin, not marked up', () => {
    const kitchen = createSampleKitchen();
    const withDelivery: Project = {
      ...kitchen,
      settings: { ...kitchen.settings, deliveryFeeExGst: 250 },
    };
    const a = costProject(kitchen);
    const b = costProject(withDelivery);

    expect(b.deliveryFee).toBe(25_000);
    // Margin is unchanged — the fee is passed on, not sold on.
    expect(b.marginAmount).toBe(a.marginAmount);
    expect(b.subtotalExGst).toBe(a.subtotalExGst);
    expect(b.sellExGst).toBe(a.sellExGst + 25_000);
  });

  it('charges GST on delivery when registered', () => {
    const kitchen = createSampleKitchen();
    const withDelivery: Project = {
      ...kitchen,
      settings: { ...kitchen.settings, deliveryFeeExGst: 250 },
    };
    const c = costProject(withDelivery);
    expect(c.gst).toBe(Math.round(c.sellExGst * 0.1));
    expect(c.totalIncGst).toBe(c.sellExGst + c.gst);
  });
});

describe('migrating a job saved before reveals were split', () => {
  const v1Job = () => {
    const current = createSampleKitchen();
    // Rebuild what a v1 file looked like: one reveal, one gap.
    return {
      ...current,
      schemaVersion: 1,
      constructions: current.constructions.map((c) => {
        const { revealTopBottom, revealSides, gapBetweenDoors, gapBetweenDrawers, ...rest } = c;
        void revealTopBottom;
        void revealSides;
        void gapBetweenDoors;
        void gapBetweenDrawers;
        return { ...rest, frontReveal: 1.5, frontGap: 3 };
      }),
      settings: {
        ...current.settings,
        deliveryFeeExGst: undefined,
        labour: {
          ratePerHourExGst: 85,
          minutesPerPanel: 4,
          minutesPerBandedEdge: 1.5,
          minutesPerCabinet: 25,
        },
      },
    };
  };

  it('carries the old single reveal into both new ones, so parts do not change', () => {
    const migrated = migrateProject(JSON.parse(JSON.stringify(v1Job())));
    const c = migrated.constructions[0]!;

    expect(migrated.schemaVersion).toBe(2);
    expect(c.revealTopBottom).toBe(1.5);
    expect(c.revealSides).toBe(1.5);
    expect(c.gapBetweenDoors).toBe(3);
    expect(c.gapBetweenDrawers).toBe(3);

    // The whole point: a migrated job still cuts exactly as it did.
    const fresh = createSampleKitchen();
    const doorFresh = buildCabinet(fresh.cabinets[0]!, fresh).panels.find((p) => p.name === 'Door L')!;
    const doorMigrated = buildCabinet(migrated.cabinets[0]!, migrated).panels.find(
      (p) => p.name === 'Door L',
    )!;
    expect(doorMigrated.profile).toEqual(doorFresh.profile);
  });

  it('fills in install and delivery without changing what was already there', () => {
    const migrated = migrateProject(JSON.parse(JSON.stringify(v1Job())));
    expect(migrated.settings.deliveryFeeExGst).toBe(0);
    expect(migrated.settings.labour.installHoursMode).toBe('mirror-manufacturing');
    // Install defaults to the shop rate rather than inventing a number.
    expect(migrated.settings.labour.installRatePerHourExGst).toBe(85);
    expect(migrated.settings.labour.ratePerHourExGst).toBe(85);
  });

  it('refuses a file from a newer build rather than silently mangling it', () => {
    expect(() => migrateProject({ schemaVersion: 99 })).toThrow(/newer version/);
  });

  it('still rejects data with no version at all', () => {
    expect(() => migrateProject({})).toThrow(/missing schemaVersion/);
  });
});
