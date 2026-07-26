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
  CURRENT_STANDARDS_VERSION,
  differencesFromStandards,
  matchesStandards,
  migrateStandards,
} from '../src/core/standards/standards.ts';
import { FRAMELESS_32 } from '../src/core/model/construction.ts';
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

  it('is not something to warn about — it is just the truth about the board', () => {
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

/*
 * Taking the thicknesses off the construction method.
 *
 * v4 had already stopped calculating from them — the board decides — so they survived only as
 * a nominal the method was "built around". Two places claiming to know one fact, so they went.
 *
 * The two shipped methods differed *only* in those numbers, so once stripped they are the same
 * method written twice and fold into one. A method a shop genuinely edited does not fold, and
 * every cabinet is repointed at whichever method survived.
 */
describe('migrating a job whose construction methods still carried thicknesses', () => {
  /** A v4 job: two shipped methods, cabinets on the 16mm one. */
  const v4Job = () => ({
    schemaVersion: 4,
    id: 'p1',
    name: 'Old job',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    room: createSampleKitchen().room,
    materials: createSampleKitchen().materials,
    settings: createSampleKitchen().settings,
    defaults: { ...createSampleKitchen().defaults, constructionId: 'frameless-32-16' },
    constructions: [
      { ...FRAMELESS_32, id: 'frameless-32-16', name: 'Frameless 32mm — 16mm carcass', carcassThickness: 16, backThickness: 16, doorThickness: 18 },
      { ...FRAMELESS_32, id: 'frameless-32-18', name: 'Frameless 32mm — 18mm carcass', carcassThickness: 18, backThickness: 18, doorThickness: 18 },
    ],
    cabinets: [
      { ...createSampleKitchen().cabinets[0]!, constructionId: 'frameless-32-16' },
      { ...createSampleKitchen().cabinets[1]!, constructionId: 'frameless-32-18' },
    ],
  });

  it('folds the two shipped methods into one and drops the thicknesses', () => {
    const migrated = migrateProject(JSON.parse(JSON.stringify(v4Job())));

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.constructions).toHaveLength(1);
    expect(migrated.constructions[0]!.name).toBe('Frameless 32mm');
    expect('carcassThickness' in migrated.constructions[0]!).toBe(false);
  });

  it('repoints every cabinet at the method that survived', () => {
    const migrated = migrateProject(JSON.parse(JSON.stringify(v4Job())));
    const survivingId = migrated.constructions[0]!.id;

    // The cabinet that was on the 18mm method has to land somewhere that still exists,
    // otherwise the rule engine throws the moment the job is opened.
    expect(migrated.cabinets.map((c) => c.constructionId)).toEqual([survivingId, survivingId]);
    expect(migrated.defaults.constructionId).toBe(survivingId);
    for (const cabinet of migrated.cabinets) {
      expect(() => buildCabinet(cabinet, migrated)).not.toThrow();
    }
  });

  it('keeps both methods when a shop genuinely edited one of them', () => {
    // A 100mm kick on the second method makes it a different method, not a duplicate. Folding
    // it away would silently re-cut every cabinet built to it.
    const edited = JSON.parse(JSON.stringify(v4Job()));
    edited.constructions[1].kickHeight = 100;
    const migrated = migrateProject(edited);

    expect(migrated.constructions).toHaveLength(2);
    expect(migrated.constructions.map((c) => c.kickHeight)).toEqual([150, 100]);
    // Both now want to be called "Frameless 32mm", so they get told apart.
    expect(new Set(migrated.constructions.map((c) => c.name)).size).toBe(2);
    // And the cabinet built to the edited method still points at it.
    expect(migrated.cabinets[1]!.constructionId).toBe('frameless-32-18');
  });

  it('cuts a migrated job to exactly the sizes it cut before', () => {
    // Nothing dimensional changed: the thicknesses stopped sizing parts back in v4.
    const migrated = migrateProject(JSON.parse(JSON.stringify(v4Job())));
    const fresh = createSampleKitchen();

    const before = buildCabinet(fresh.cabinets[0]!, fresh).panels;
    const after = buildCabinet(migrated.cabinets[0]!, migrated).panels;
    expect(after.map((p) => p.profile)).toEqual(before.map((p) => p.profile));
  });
});

describe('migrating shop standards', () => {
  /** v1 standards, with the two shipped methods and a shop's own kick height and saved type. */
  const v1Standards = () => ({
    version: 1,
    name: 'My shop',
    updatedAt: '2026-01-01T00:00:00.000Z',
    materials: AU_SHOP_STANDARDS.materials,
    settings: AU_SHOP_STANDARDS.settings,
    defaults: { ...AU_SHOP_STANDARDS.defaults, constructionId: 'frameless-32-18' },
    constructions: [
      { ...FRAMELESS_32, id: 'frameless-32-16', name: 'Frameless 32mm — 16mm carcass', kickHeight: 100, carcassThickness: 16, backThickness: 16, doorThickness: 18 },
      { ...FRAMELESS_32, id: 'frameless-32-18', name: 'Frameless 32mm — 18mm carcass', kickHeight: 100, carcassThickness: 18, backThickness: 18, doorThickness: 18 },
    ],
    savedTypes: [{ id: 't1', name: 'Bin cupboard', typeId: 'base', width: 600, height: 720, depth: 560, options: {}, materials: {} }],
  });

  it('migrates rather than rejecting, so nobody loses their shop standards', () => {
    // Refusing the old file would silently replace years of accumulated preference with the
    // shipped Australian defaults — far worse than the schema change it would be guarding.
    const migrated = migrateStandards(JSON.parse(JSON.stringify(v1Standards())));

    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    expect(migrated.name).toBe('My shop');
    expect(migrated.constructions).toHaveLength(1);
    // Their 100mm kick survived, and so did their saved cabinet type.
    expect(migrated.constructions[0]!.kickHeight).toBe(100);
    expect(migrated.savedTypes.map((t) => t.name)).toEqual(['Bin cupboard']);
  });

  it('repoints the default construction at the method that survived', () => {
    const migrated = migrateStandards(JSON.parse(JSON.stringify(v1Standards())));
    expect(migrated.defaults.constructionId).toBe(migrated.constructions[0]!.id);
  });

  it('refuses standards from a newer build', () => {
    expect(() => migrateStandards({ version: CURRENT_STANDARDS_VERSION + 1 })).toThrow(
      /newer version/,
    );
  });

  it('rejects standards with no version at all', () => {
    expect(() => migrateStandards({})).toThrow(/missing version/);
  });
});
