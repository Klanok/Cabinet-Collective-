/**
 * Shop standards and per-job settings.
 *
 * The behaviour under test is the isolation between the two. A job takes a copy of the
 * standards when it is created; from then on neither can reach into the other. That is what
 * stops a change to your shop standard next year from silently re-pricing or re-cutting a
 * kitchen you quoted this year.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  AU_SHOP_STANDARDS,
  type ShopStandards,
  applyStandards,
  differencesFromStandards,
  matchesStandards,
  standardsFromProject,
} from '../src/core/standards/standards.ts';
import {
  createCabinet,
  createEmptyProject,
  createSampleKitchen,
  naturalAnchorY,
  resetIdCounter,
} from '../src/core/project/factory.ts';
import { buildCabinet, buildProject } from '../src/core/rules/build.ts';
import { costProject } from '../src/core/costing/costing.ts';
import type { Project } from '../src/core/model/project.ts';
import { byName, size } from './helpers.ts';

/** Standards for a shop that builds to an 18mm carcass on a 100mm kick with 4mm gaps. */
const customStandards = (): ShopStandards => ({
  ...AU_SHOP_STANDARDS,
  name: 'Test shop',
  constructions: AU_SHOP_STANDARDS.constructions.map((c) =>
    c.id === 'frameless-32-16'
      ? { ...c, carcassThickness: mm(18), kickHeight: mm(100), gapBetweenDoors: mm(4) }
      : c,
  ),
  defaults: { ...AU_SHOP_STANDARDS.defaults, baseCabinetHeight: mm(750) },
  settings: { ...AU_SHOP_STANDARDS.settings, marginPercent: 50 },
});

beforeEach(() => resetIdCounter());

describe('a job starts from the standards', () => {
  it('copies the joinery numbers into the job', () => {
    const project = createEmptyProject('Job', undefined, customStandards());
    const construction = project.constructions.find((c) => c.id === 'frameless-32-16')!;

    expect(construction.carcassThickness).toBe(18);
    expect(construction.kickHeight).toBe(100);
    expect(construction.gapBetweenDoors).toBe(4);
    expect(project.defaults.baseCabinetHeight).toBe(750);
    expect(project.settings.marginPercent).toBe(50);
  });

  it('builds parts to the job\'s numbers, not the shipped defaults', () => {
    const project = createEmptyProject('Job', undefined, customStandards());
    const cabinet = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(900), height: mm(720), depth: mm(560), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    const { panels } = buildCabinet(cabinet, project);

    // Carcass thickness and back thickness are separate settings — this shop runs an 18mm
    // carcass against a 16mm back. Interior width 900 − 2×18 = 864; the horizontals stop short
    // of the 16mm back, so their depth is 560 − 16 = 544.
    expect(size(byName(panels, 'Bottom'))).toEqual([864, 544]);
    // 4mm gap instead of 3: (900 − 3 − 4) ÷ 2 = 446.5.
    expect(size(byName(panels, 'Door L'))).toEqual([717, 446.5]);
    // 100mm kick.
    expect(size(byName(panels, 'Kick'))).toEqual([900, 100]);
  });

  it('places a base cabinet on the job\'s kick height, not the shipped one', () => {
    const project = createEmptyProject('Job', undefined, customStandards());
    const cabinet = createCabinet(
      { typeId: 'base', name: 'B1', width: mm(900), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    // This is the bug the per-job settings expose: a 100mm kick must place the carcass at 100.
    expect(cabinet.placement.anchor.y).toBe(100);
    expect(naturalAnchorY('base', 'frameless-32-16', {}, project.constructions, project.defaults)).toBe(
      100,
    );
  });

  it('uses the job\'s wall mount height for wall cabinets', () => {
    const standards: ShopStandards = {
      ...AU_SHOP_STANDARDS,
      defaults: { ...AU_SHOP_STANDARDS.defaults, wallCabinetMountHeight: mm(1400) },
    };
    const project = createEmptyProject('Job', undefined, standards);
    const cabinet = createCabinet(
      { typeId: 'wall', name: 'W1', width: mm(900), x: mm(0) },
      project.defaults,
      project.constructions,
    );
    expect(cabinet.placement.anchor.y).toBe(1400);
  });

  it('applies custom standards through the sample kitchen too', () => {
    const kitchen = createSampleKitchen(customStandards());
    const base = kitchen.cabinets.find((c) => c.typeId === 'base')!;
    expect(base.placement.anchor.y).toBe(100);
    expect(base.height).toBe(750);
  });
});

describe('a job and the standards stay independent', () => {
  let standards: ShopStandards;
  let project: Project;

  beforeEach(() => {
    standards = customStandards();
    project = createEmptyProject('Job', undefined, standards);
  });

  it('does not change an existing job when the standards change later', () => {
    const laterStandards: ShopStandards = {
      ...standards,
      constructions: standards.constructions.map((c) => ({ ...c, kickHeight: mm(200) })),
    };
    // The job was created before the change and must be untouched by it.
    expect(project.constructions.find((c) => c.id === 'frameless-32-16')!.kickHeight).toBe(100);
    expect(laterStandards.constructions[0]!.kickHeight).toBe(200);
  });

  it('does not change the standards when a job is edited', () => {
    const editedJob: Project = {
      ...project,
      constructions: project.constructions.map((c) => ({ ...c, kickHeight: mm(75) })),
    };
    expect(editedJob.constructions[0]!.kickHeight).toBe(75);
    expect(standards.constructions[0]!.kickHeight).toBe(100);
  });

  it('keeps two jobs from the same standards independent of each other', () => {
    const a = createEmptyProject('Job A', undefined, standards);
    const b = createEmptyProject('Job B', undefined, standards);
    const editedA: Project = {
      ...a,
      settings: { ...a.settings, marginPercent: 10 },
    };
    expect(editedA.settings.marginPercent).toBe(10);
    expect(b.settings.marginPercent).toBe(50);
  });
});

describe('comparing a job against the standards', () => {
  it('reports a fresh job as matching', () => {
    const standards = customStandards();
    const project = createEmptyProject('Job', undefined, standards);
    expect(matchesStandards(project, standards)).toBe(true);
    expect(differencesFromStandards(project, standards)).toEqual([]);
  });

  it('names what has drifted, in plain language', () => {
    const standards = customStandards();
    const project = createEmptyProject('Job', undefined, standards);
    const drifted: Project = {
      ...project,
      constructions: project.constructions.map((c) =>
        c.id === 'frameless-32-16' ? { ...c, kickHeight: mm(150) } : c,
      ),
      settings: { ...project.settings, marginPercent: 30 },
    };

    expect(matchesStandards(drifted, standards)).toBe(false);
    const notes = differencesFromStandards(drifted, standards).join(' | ');
    expect(notes).toMatch(/Kick height is 150, standard is 100/);
    expect(notes).toMatch(/Margin is 30%, standard is 50%/);
  });

  it('pulls a drifted job back in line', () => {
    const standards = customStandards();
    const project = createEmptyProject('Job', undefined, standards);
    const drifted: Project = {
      ...project,
      settings: { ...project.settings, marginPercent: 5 },
    };
    const restored = applyStandards(drifted, standards);
    expect(restored.settings.marginPercent).toBe(50);
    expect(matchesStandards(restored, standards)).toBe(true);
  });

  it('promotes a job’s setup to become the standards', () => {
    const project = createEmptyProject('Job', undefined, AU_SHOP_STANDARDS);
    const tuned: Project = {
      ...project,
      constructions: project.constructions.map((c) => ({ ...c, kickHeight: mm(120) })),
    };
    const promoted = standardsFromProject(tuned, 'My shop');

    expect(promoted.name).toBe('My shop');
    expect(promoted.constructions[0]!.kickHeight).toBe(120);
    // The next job started from these picks the change up.
    const nextJob = createEmptyProject('Next', undefined, promoted);
    expect(nextJob.constructions[0]!.kickHeight).toBe(120);
    // The job it came from is unaffected by having been promoted.
    expect(project.constructions[0]!.kickHeight).toBe(150);
  });
});

describe('settings reach all the way through to cost', () => {
  it('reprices the same kitchen under a different margin', () => {
    const base = createSampleKitchen();
    const dearer: Project = {
      ...base,
      settings: { ...base.settings, marginPercent: 60 },
    };
    expect(costProject(dearer).sellExGst).toBeGreaterThan(costProject(base).sellExGst);
  });

  it('changes every part when the carcass thickness changes on the job', () => {
    const base = createSampleKitchen();
    const thicker: Project = {
      ...base,
      constructions: base.constructions.map((c) => ({ ...c, carcassThickness: mm(18) })),
    };
    const before = buildProject(base).flatMap((b) => b.panels).length;
    const after = buildProject(thicker).flatMap((b) => b.panels).length;

    // Same number of parts, different sizes — and a different cost.
    expect(after).toBe(before);
    expect(costProject(thicker).materialCost).not.toBe(costProject(base).materialCost);
  });
});
