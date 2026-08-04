/**
 * The NaN quote — a whole job's costing wiped out by one absent labour rate.
 *
 * Reported from the bench as NaN in the permanent total in the corner of the screen and in
 * several figures low down the Cost tab. Both are the same number: everything from `totalCost`
 * downward is derived from one sum, so one NaN upstream takes the lot.
 *
 * ## The arithmetic, because the symptom points nowhere near the cause
 *
 * v23 added the finish laminate over a curved wrap. It migrated the construction methods and the
 * material list, and it did not migrate `settings.labour`, which gained two rates in the same
 * change. So a job saved before then loads with `laminateSetupMinutesPerCurve` undefined, and
 * `costing.ts` computes `laminatedCurves * undefined`.
 *
 * ```
 *   0 * undefined  =  NaN
 * ```
 *
 * **It does not wait for a job with a curve in it.** The sample kitchen has no curved part
 * anywhere and still went NaN, which is why this reached every job rather than the few with a
 * radius. That is the assertion worth having: the bug is not "laminate costing is wrong", it is
 * "a missing rate poisons arithmetic that should never have touched it".
 */

import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrateProject } from '../src/core/model/project.ts';
import type { Project } from '../src/core/model/project.ts';
import { DEFAULT_LABOUR_RATES } from '../src/core/model/project.ts';
import { costProject } from '../src/core/costing/costing.ts';
import {
  createEmptyProject,
  createSampleKitchen,
  resetIdCounter,
} from '../src/core/project/factory.ts';
import {
  AU_SHOP_STANDARDS,
  CURRENT_STANDARDS_VERSION,
  migrateStandards,
} from '../src/core/standards/standards.ts';

/** The sample kitchen as a file saved before the laminate rates existed. */
const savedWithoutLaminateRates = (version: number): Record<string, unknown> => {
  resetIdCounter();
  const p = createSampleKitchen();
  const labour = { ...p.settings.labour } as Record<string, unknown>;
  delete labour.laminateSetupMinutesPerCurve;
  delete labour.laminateMinutesPerM2;
  return {
    ...p,
    schemaVersion: version,
    settings: { ...p.settings, labour },
  } as unknown as Record<string, unknown>;
};

describe('a job saved before the laminate labour rates existed', () => {
  /** The bug itself, stated as arithmetic so it cannot come back quietly. */
  it('would print NaN through the whole quote', () => {
    const old = savedWithoutLaminateRates(24) as unknown as Project;
    const broken = costProject(old);
    // No curve in this kitchen at all — the NaN is not about laminating.
    expect(broken.laminatedCurves).toBe(0);
    expect(Number.isNaN(broken.laminateMinutes)).toBe(true);
    expect(Number.isNaN(broken.totalCost)).toBe(true);
    expect(Number.isNaN(broken.totalIncGst)).toBe(true);
  });

  it('costs cleanly once migrated', () => {
    const migrated = migrateProject(savedWithoutLaminateRates(24));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const cost = costProject(migrated);
    for (const [key, value] of Object.entries(cost)) {
      if (typeof value === 'number') expect([key, Number.isNaN(value)]).toEqual([key, false]);
    }
    expect(cost.totalIncGst).toBeGreaterThan(0);
  });

  it('fills every absent rate from the shipped defaults', () => {
    const migrated = migrateProject(savedWithoutLaminateRates(24));
    expect(migrated.settings.labour.laminateSetupMinutesPerCurve).toBe(
      DEFAULT_LABOUR_RATES.laminateSetupMinutesPerCurve,
    );
    expect(migrated.settings.labour.laminateMinutesPerM2).toBe(
      DEFAULT_LABOUR_RATES.laminateMinutesPerM2,
    );
  });

  /**
   * The v11 → v12 rule, which is the one that keeps a migration honest: fill what is absent and
   * touch nothing somebody set. A shop on $110/h does not come back on $85 because their job also
   * happened to be missing a laminate rate.
   */
  it('leaves a rate the shop set alone, including a deliberate zero', () => {
    const raw = savedWithoutLaminateRates(24);
    const settings = raw.settings as Record<string, unknown>;
    raw.settings = {
      ...settings,
      labour: { ...(settings.labour as object), ratePerHourExGst: 110, minutesPerCabinet: 0 },
    };
    const migrated = migrateProject(raw);
    expect(migrated.settings.labour.ratePerHourExGst).toBe(110);
    expect(migrated.settings.labour.minutesPerCabinet).toBe(0);
  });

  /**
   * The reason the backfill is written over the whole record rather than naming the two fields:
   * the next rate added must not be able to repeat this.
   */
  it('fills a rate nobody has thought of yet', () => {
    const raw = savedWithoutLaminateRates(24);
    const settings = raw.settings as Record<string, unknown>;
    const labour = { ...(settings.labour as Record<string, unknown>) };
    delete labour.minutesPerBandedEdge;
    delete labour.installRatePerHourExGst;
    raw.settings = { ...settings, labour };
    const migrated = migrateProject(raw);
    expect(migrated.settings.labour.minutesPerBandedEdge).toBe(
      DEFAULT_LABOUR_RATES.minutesPerBandedEdge,
    );
    expect(migrated.settings.labour.installRatePerHourExGst).toBe(
      DEFAULT_LABOUR_RATES.installRatePerHourExGst,
    );
    expect(Number.isNaN(costProject(migrated).totalIncGst)).toBe(false);
  });

  /** A job coming the whole way up the chain, not just from the version before this one. */
  it('repairs a job arriving from an older schema too', () => {
    const migrated = migrateProject(savedWithoutLaminateRates(22));
    expect(Number.isNaN(costProject(migrated).totalIncGst)).toBe(false);
  });
});

/**
 * ## The same bug, reported a second time, arriving through the door the above left open
 *
 * Everything in the block above starts at schema 22 or 24 — *below* the version that repairs it —
 * so the repair always runs and the tests always pass. That is why they were green while the bench
 * was looking at `$NaN`.
 *
 * The route they cannot see:
 *
 * 1. The two laminate rates also live in the **shop standards**, versioned separately.
 * 2. **No standards migration has ever touched `settings.labour`** — v18 → v19 is the laminate's own
 *    standards migration and it fills in `constructions` and stops. So a shop's stored standards
 *    keep the holes through the entire chain.
 * 3. `createEmptyProject` copies the standards into a new job verbatim, and stamps it at the
 *    **current** schema — so the project chain that knows the repair never runs on it.
 *
 * The job is therefore born broken, at the newest version, and every existing test starts one or
 * more versions too early to notice. `migrateStandardsV20toV21` is the fix; `migrateV28toV29` sweeps
 * up the jobs already made this way.
 *
 * These assertions are written from the **standards** end rather than the job end for exactly that
 * reason — asserting from the job end is what missed it.
 */
describe('shop standards saved before the laminate labour rates existed', () => {
  /** Standards as they sit in a long-running browser: everything current except these two rates. */
  const standardsWithoutLaminateRates = (version: number): Record<string, unknown> => {
    const labour = { ...AU_SHOP_STANDARDS.settings.labour } as Record<string, unknown>;
    delete labour.laminateSetupMinutesPerCurve;
    delete labour.laminateMinutesPerM2;
    return {
      ...AU_SHOP_STANDARDS,
      version,
      settings: { ...AU_SHOP_STANDARDS.settings, labour },
    } as unknown as Record<string, unknown>;
  };

  it('fills the rates in, so the next job is not born broken', () => {
    const migrated = migrateStandards(standardsWithoutLaminateRates(20));
    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    expect(migrated.settings.labour.laminateSetupMinutesPerCurve).toBe(
      DEFAULT_LABOUR_RATES.laminateSetupMinutesPerCurve,
    );
    expect(migrated.settings.labour.laminateMinutesPerM2).toBe(
      DEFAULT_LABOUR_RATES.laminateMinutesPerM2,
    );
  });

  /**
   * **The bug as reported, end to end.** Broken standards in, new job out, quote priced — and the
   * job has no curve in it, which is what made the cause so hard to see from the symptom.
   */
  it('gives a new job a quote that is a number, not NaN', () => {
    resetIdCounter();
    const standards = migrateStandards(standardsWithoutLaminateRates(20));
    const job = createEmptyProject('New job', 'Bench report', standards);
    const cost = costProject(job);
    expect(cost.laminatedCurves).toBe(0);
    for (const [key, value] of Object.entries(cost)) {
      if (typeof value === 'number') expect([key, Number.isNaN(value)]).toEqual([key, false]);
    }
  });

  /** A shop's own figures survive the repair, exactly as they do on the project side. */
  it('leaves a rate the shop set alone, including a deliberate zero', () => {
    const raw = standardsWithoutLaminateRates(20);
    const settings = raw.settings as Record<string, unknown>;
    raw.settings = {
      ...settings,
      labour: { ...(settings.labour as object), ratePerHourExGst: 110, minutesPerCabinet: 0 },
    };
    const migrated = migrateStandards(raw);
    expect(migrated.settings.labour.ratePerHourExGst).toBe(110);
    expect(migrated.settings.labour.minutesPerCabinet).toBe(0);
  });
});

/**
 * The sweep-up half: a job that was **already created** from broken standards.
 *
 * It is sitting in the browser at the schema that was current when it was made, with the holes in
 * it, and nothing would ever migrate it again. This is the job on the bench's screen.
 */
describe('a job already created from broken standards', () => {
  const jobBornBroken = (schemaVersion: number): Record<string, unknown> => {
    resetIdCounter();
    const p = createSampleKitchen();
    const labour = { ...p.settings.labour } as Record<string, unknown>;
    delete labour.laminateSetupMinutesPerCurve;
    delete labour.laminateMinutesPerM2;
    return {
      ...p,
      schemaVersion,
      settings: { ...p.settings, labour },
    } as unknown as Record<string, unknown>;
  };

  /* The state that was on screen: stamped at what was then the newest schema, and still broken. */
  it('was NaN and had no migration left to run', () => {
    const broken = jobBornBroken(28) as unknown as Project;
    expect(Number.isNaN(costProject(broken).totalCost)).toBe(true);
  });

  it('is repaired on load now', () => {
    const migrated = migrateProject(jobBornBroken(28));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Number.isNaN(costProject(migrated).totalIncGst)).toBe(false);
  });

  /**
   * **Nothing re-prices.** The strong form, not the careful one: an intact job coming through the
   * new version costs to the cent what it did before. A repair that moved a price would be a
   * different kind of change and would have to argue for itself the way v9, v11 and v27 do.
   */
  it('does not move the price of a job that was never broken', () => {
    resetIdCounter();
    const intact = createSampleKitchen();
    const before = costProject(intact);
    const through = migrateProject({
      ...intact,
      schemaVersion: 28,
    } as unknown as Record<string, unknown>);
    expect(costProject(through).totalIncGst).toBe(before.totalIncGst);
  });
});

/**
 * A missing rate is a sentence, never silence — §4.19's rule about the cushion charge, applied to
 * the figure that has now taken the whole quote down twice.
 */
describe('costing names a labour rate it cannot use', () => {
  it('warns by name instead of quoting NaN in silence', () => {
    const broken = savedWithoutLaminateRates(CURRENT_SCHEMA_VERSION) as unknown as Project;
    const warnings = costProject(broken).warnings.join('\n');
    expect(warnings).toContain('laminateSetupMinutesPerCurve');
    expect(warnings).toContain('laminateMinutesPerM2');
  });

  it('says nothing about labour on a job whose rates are all there', () => {
    resetIdCounter();
    const warnings = costProject(createSampleKitchen()).warnings.join('\n');
    expect(warnings).not.toContain('labour rate');
  });
});
