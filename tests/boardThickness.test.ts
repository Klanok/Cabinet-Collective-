/**
 * Nominal versus actual board thickness.
 *
 * A sheet has two thicknesses and they do different jobs:
 *
 *   nominal   what it is **called** — ordered, invoiced, labelled on the cutlist, sorted by
 *   actual    what it **measures** — every part that has to fit between two boards
 *
 * Nominal 16mm melamine particleboard runs about 16.3. Reference cabinet throughout is the
 * standard one, 900 W × 720 H × 560 D on a 16mm applied back:
 *
 *                          at nominal 16          at measured 16.3
 *   interior width         900 − 2×16   = 868     900 − 2×16.3 = 867.4
 *   side depth             560 − 16     = 544     560 − 16.3   = 543.7
 *   interior height        720 − 2×16   = 688     720 − 2×16.3 = 687.4
 *
 * The 0.6mm on the bottom panel is the whole point: cut at 868 it does not go in.
 *
 * Nothing measures anything by default. A material ships as "it measures what it says", so a
 * job cuts exactly as it always did until somebody deliberately enters a real figure.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  migrateProject,
} from '../src/core/model/project.ts';
import { actualThicknessOf, findSheet, isOversize } from '../src/core/model/material.ts';
import { buildCabinet } from '../src/core/rules/build.ts';
import { buildCutlist } from '../src/core/cutlist/cutlist.ts';
import { costProject } from '../src/core/costing/costing.ts';
import {
  createCabinet,
  createEmptyProject,
  createSampleKitchen,
  resetIdCounter,
} from '../src/core/project/factory.ts';
import {
  AU_SHOP_STANDARDS,
  differencesFromStandards,
  matchesStandards,
} from '../src/core/standards/standards.ts';
import { byName, occupies, size } from './helpers.ts';

let project: Project;

/** Say what a board really measures, leaving what it is called alone. */
const measured = (p: Project, sheetId: string, actual: number): Project => ({
  ...p,
  materials: {
    ...p.materials,
    sheets: p.materials.sheets.map((s) =>
      s.id === sheetId ? { ...s, actualThickness: mm(actual) } : s,
    ),
  },
});

const reference = (p: Project) =>
  buildCabinet(
    createCabinet(
      { typeId: 'base', name: 'B1', width: mm(900), height: mm(720), depth: mm(560), x: mm(0) },
      p.defaults,
      p.constructions,
    ),
    p,
  );

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Board thickness');
});

describe('a board that has never been measured', () => {
  it('measures what it says', () => {
    const sheet = findSheet(project.materials, 'hmr-white-16');
    expect(actualThicknessOf(sheet)).toBe(16);
    expect(isOversize(sheet)).toBe(false);
  });

  it('cuts exactly as it always did', () => {
    const { panels } = reference(project);
    expect(size(byName(panels, 'Bottom'))).toEqual([868, 544]);
    expect(size(byName(panels, 'Side L'))).toEqual([720, 544]);
  });
});

describe('a 16mm board measured at 16.3', () => {
  let job: Project;

  beforeEach(() => {
    job = measured(project, 'hmr-white-16', 16.3);
  });

  it('is still called 16mm', () => {
    const sheet = findSheet(job.materials, 'hmr-white-16');
    expect(sheet.thickness).toBe(16);
    expect(actualThicknessOf(sheet)).toBe(16.3);
    expect(isOversize(sheet)).toBe(true);
  });

  it('cuts the parts that fit between the boards 0.6mm narrower', () => {
    const { panels } = reference(job);
    expect(size(byName(panels, 'Bottom'))).toEqual([867.4, 543.7]);
  });

  it('leaves the parts that do not fit between anything alone', () => {
    const { panels } = reference(job);
    // The back covers the whole carcass face; the doors sit on the front of it.
    expect(size(byName(panels, 'Back'))).toEqual([900, 720]);
    expect(size(byName(panels, 'Door L'))).toEqual([717, 447]);
    // A side is only shortened front-to-back, by the thicker back panel it stops behind.
    expect(size(byName(panels, 'Side L'))).toEqual([720, 543.7]);
  });

  it('puts the bottom in the hole it now leaves', () => {
    // The real check: the bottom has to sit exactly between the two sides, wherever they are.
    const { panels } = reference(job);
    const left = occupies(byName(panels, 'Side L'), job);
    const right = occupies(byName(panels, 'Side R'), job);
    const bottom = occupies(byName(panels, 'Bottom'), job);

    expect(left.x).toEqual([0, 16.3]);
    expect(right.x).toEqual([883.7, 900]);
    expect(bottom.x).toEqual([16.3, 883.7]);
    // And it is exactly one board thick.
    expect(bottom.y[1] - bottom.y[0]).toBeCloseTo(16.3, 9);
  });

  it('still orders and groups the board as 16mm', () => {
    const kitchen = measured(createSampleKitchen(), 'hmr-white-16', 16.3);
    const carcassLines = buildCutlist(kitchen).filter((l) => l.materialId === 'hmr-white-16');

    expect(carcassLines.length).toBeGreaterThan(0);
    for (const line of carcassLines) {
      expect(line.thickness).toBe(16);
      expect(line.materialLabel).toContain('16mm');
    }
  });

  it('costs differently, because the parts are a different size', () => {
    const kitchen = createSampleKitchen();
    expect(costProject(measured(kitchen, 'hmr-white-16', 16.3)).materialCost).not.toBe(
      costProject(kitchen).materialCost,
    );
  });

  it('is not treated as a mismatch with the construction method', () => {
    // The method is built around 16mm board. This *is* 16mm board — it just measures 16.3.
    expect(reference(job).warnings).toEqual([]);
  });
});

describe('a measured board counts as drifting from the standards', () => {
  it('says which board, and what it is now cut at', () => {
    const job = measured(createEmptyProject('Job'), 'hmr-white-16', 16.3);

    expect(matchesStandards(job, AU_SHOP_STANDARDS)).toBe(false);
    // "Not in sync" on its own is no use — the point of the list is to say what changed.
    expect(differencesFromStandards(job, AU_SHOP_STANDARDS).join(' ')).toMatch(
      /White HMR particleboard 16mm is cut at 16.3mm, standard is 16mm/,
    );
  });

  it('says so when a job is built on a different board entirely', () => {
    const job = createEmptyProject('Job');
    const eighteen: Project = {
      ...job,
      defaults: { ...job.defaults, carcassMaterialId: 'hmr-white-18' },
    };
    expect(differencesFromStandards(eighteen, AU_SHOP_STANDARDS).join(' ')).toMatch(
      /Carcass board is hmr-white-18/,
    );
  });

  it('reports nothing for a job that has not been touched', () => {
    expect(differencesFromStandards(createEmptyProject('Job'), AU_SHOP_STANDARDS)).toEqual([]);
  });
});

describe('measuring each board separately', () => {
  it('moves only the parts made from the board that was measured', () => {
    // The carcass runs 16.3; the back is a different sheet and still measures 16.
    const job = measured(project, 'hmr-white-16', 16.3);
    const separateBack: Project = {
      ...job,
      defaults: { ...job.defaults, backMaterialId: 'poly-classic-white-back-16' },
    };
    const { panels } = reference(separateBack);

    // Interior width follows the carcass at 16.3; the horizontals stop short of a 16mm back.
    expect(size(byName(panels, 'Bottom'))).toEqual([867.4, 544]);
  });
});

describe('migrating a job saved before boards could be measured', () => {
  /** A v3 job — the schema as it stood when the room-plan work shipped. */
  const v3Job = () => {
    const current = createSampleKitchen();
    return {
      ...current,
      schemaVersion: 3,
      materials: {
        ...current.materials,
        sheets: current.materials.sheets.map(({ actualThickness, ...rest }) => {
          void actualThickness;
          return rest;
        }),
      },
    };
  };

  it('says every board measures what it says, so nothing moves', () => {
    const migrated = migrateProject(JSON.parse(JSON.stringify(v3Job())));

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    for (const sheet of migrated.materials.sheets) {
      expect(sheet.actualThickness).toBe(sheet.thickness);
    }
  });

  it('cuts a migrated job to exactly the sizes it cut before', () => {
    const migrated = migrateProject(JSON.parse(JSON.stringify(v3Job())));
    const fresh = createSampleKitchen();

    const before = buildCabinet(fresh.cabinets[0]!, fresh).panels;
    const after = buildCabinet(migrated.cabinets[0]!, migrated).panels;
    expect(after.map((p) => p.profile)).toEqual(before.map((p) => p.profile));
  });

  it('refuses a measured file on a build that would cut it at nominal', () => {
    // The reason the schema version moved at all: an older build reading a job whose boards
    // have been measured would silently cut every part 0.6mm too big.
    expect(() => migrateProject({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(
      /newer version/,
    );
  });
});
