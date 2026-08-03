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
import { createSampleKitchen, resetIdCounter } from '../src/core/project/factory.ts';

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
