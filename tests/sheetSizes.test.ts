/**
 * A sheet is the board you are handed, not the area you can nest into.
 *
 * > *"Sheet sizes are wrong — 2400 × 1200 is the usable area, not the sheet."*
 *
 * A sheet arrives with a ragged, chipped or out-of-square margin nobody cuts a part from, and
 * 2400 × 1200 is what is left after it. Stating that as the sheet made the model take the trim off
 * **twice** — once by the supplier and again by `sheetEdgeTrim` — so a job nested into an area
 * smaller than the board really is and could buy a sheet it did not need.
 *
 * ## The figure is confirmed, not asserted
 *
 * `docs/woodtron-dialect.md` §1 carries the machine's own sheet declaration off a real job:
 *
 * ```
 *   white carcass board   2410.0 × 1205.0 × 16.3
 *   MDF door board        3115.0 × 1205.0 × 18.0
 * ```
 *
 * Which is the shop's rule exactly — 10mm over on the length, 5 over on the width — so the rule is
 * measured on the one size anybody has measured, rather than taken on trust.
 *
 * ## And only that one size moves
 *
 * **The direction of a guess is what decides it here.** A sheet stated *smaller* than it is nests
 * conservatively and buys the odd extra board; one stated *larger* places a part that does not fit
 * and cuts it short. An inconvenience against a remake. So 3600 × 1800 and 2440 × 1220 stay at the
 * usable figure and `unconfirmedSheetSizes` names them, exactly as `indicativePricing` names money
 * nobody has checked.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  migrateProject,
} from '../src/core/model/project.ts';
import {
  AU_SHEET_MATERIALS,
  unconfirmedSheetSizes,
} from '../src/core/library/materials.au.ts';
import {
  AU_SHOP_STANDARDS,
  CURRENT_STANDARDS_VERSION,
  migrateStandards,
} from '../src/core/standards/standards.ts';
import { createSampleKitchen, resetIdCounter } from '../src/core/project/factory.ts';
import { sheetSizeKey } from '../src/core/model/material.ts';
import { nestProject } from '../src/core/nest/nest.ts';

const sizesOf = (id: string) =>
  AU_SHEET_MATERIALS.find((m) => m.id === id)!.sheets.map((s) => [s.length, s.width]);

describe('the shipped sheet sizes', () => {
  it('states the carcass board at the size the machine says it is', () => {
    // Off the machine's own sheet declaration, not off the rule: 2410.0 × 1205.0.
    expect(sizesOf('hmr-white-16')).toContainEqual([2410, 1205]);
    expect(sizesOf('hmr-white-16')).not.toContainEqual([2400, 1200]);
  });

  it('leaves the sizes nobody has measured alone, and says which they are', () => {
    /*
     * **Not an oversight, and the assertion says so.** Applying the +10/+5 rule to 3600 × 1800
     * would be a guess in the dangerous direction: a sheet stated larger than it is places a part
     * that does not fit. Conservative is an extra board; optimistic is a remake.
     */
    expect(sizesOf('hmr-white-16')).toContainEqual([3600, 1800]);
    expect(unconfirmedSheetSizes.join(' ')).toContain('3600');
    expect(unconfirmedSheetSizes.join(' ')).toContain('2440');
  });

  it('does not touch what a sheet costs', () => {
    // The price is the price of that board and always was. What was wrong is how big we said it
    // is, and that shows up in the sheet *count* rather than in the rate.
    const white = AU_SHEET_MATERIALS.find((m) => m.id === 'hmr-white-16')!;
    expect(white.sheets.every((s) => s.priceExGst > 0)).toBe(true);
  });
});

describe('a job saved against the usable area', () => {
  /** A v31 job: current in every respect except that its sheets are the old figures. */
  const asV31 = (job: Project): Record<string, unknown> => {
    const raw = JSON.parse(JSON.stringify(job)) as Record<string, unknown>;
    const materials = raw.materials as Record<string, unknown>;
    return {
      ...raw,
      schemaVersion: 31,
      materials: {
        ...materials,
        sheets: (materials.sheets as Record<string, unknown>[]).map((m) => ({
          ...m,
          sheets: (m.sheets as Record<string, unknown>[]).map((s) =>
            s.length === 2410 && s.width === 1205 ? { ...s, length: 2400, width: 1200 } : s,
          ),
        })),
      },
    };
  };

  it('grows every 2400 × 1200 to the board it always was', () => {
    resetIdCounter();
    const migrated = migrateProject(asV31(createSampleKitchen(AU_SHOP_STANDARDS)));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const white = migrated.materials.sheets.find((m) => m.id === 'hmr-white-16')!;
    expect(white.sheets.map((s) => [s.length, s.width])).toContainEqual([2410, 1205]);
    expect(white.sheets.map((s) => [s.length, s.width])).not.toContainEqual([2400, 1200]);
  });

  it('leaves a size that was never the usable area exactly where it is', () => {
    // The invariant that keeps this from being a blanket resize: only the mapped size moves.
    resetIdCounter();
    const migrated = migrateProject(asV31(createSampleKitchen(AU_SHOP_STANDARDS)));
    const white = migrated.materials.sheets.find((m) => m.id === 'hmr-white-16')!;
    expect(white.sheets.map((s) => [s.length, s.width])).toContainEqual([3600, 1800]);
  });

  it('never buys more board than it did — the re-price only runs one way', () => {
    /*
     * **Every re-price before this one made a job dearer**, because it was being quoted for less
     * than it takes to build. This is the reverse and the argument is the same shape: the job was
     * being quoted for board it did not need. Asserted as a direction rather than a figure, because
     * on a given kitchen the honest answer is often "the same" — a bigger sheet only saves a board
     * when the parts were close to filling one.
     */
    resetIdCounter();
    const old = migrateProject({ ...asV31(createSampleKitchen(AU_SHOP_STANDARDS)), schemaVersion: 32 }) as Project;
    resetIdCounter();
    const now = migrateProject(asV31(createSampleKitchen(AU_SHOP_STANDARDS)));
    const sheets = (p: Project) =>
      nestProject(p).byMaterial.reduce((sum, m) => sum + m.sheets.length, 0);
    expect(sheets(now)).toBeLessThanOrEqual(sheets(old));
  });

  it('carries the shop’s chosen sheet size across with it', () => {
    /*
     * **The half that would have gone silently.** `sheetSizeKey` is the *dimensions* — deliberately,
     * so a choice survives a price change — so moving a size orphans any material set to be cut
     * from it. `nestMaterial` reports that rather than failing, which is honest, but it is still a
     * setting somebody made quietly reverting to automatic.
     */
    resetIdCounter();
    const base = asV31(createSampleKitchen(AU_SHOP_STANDARDS));
    const settings = base.settings as Record<string, unknown>;
    const withChoice = {
      ...base,
      settings: {
        ...settings,
        nesting: {
          ...(settings.nesting as Record<string, unknown>),
          sheetSizes: { 'hmr-white-16': '2400x1200', 'mdf-raw-18': '3600x1800' },
        },
      },
    };
    const migrated = migrateProject(withChoice);
    expect(migrated.settings.nesting.sheetSizes).toEqual({
      'hmr-white-16': '2410x1205',
      // Untouched, because that size did not move.
      'mdf-raw-18': '3600x1800',
    });
    // And the key it now points at is a size the material really has.
    const white = migrated.materials.sheets.find((m) => m.id === 'hmr-white-16')!;
    expect(white.sheets.map(sheetSizeKey)).toContain('2410x1205');
  });

  it('repairs the shop standards too, not only the job', () => {
    // §4.22's lesson: a repair that reaches the job and not the standards it is copied from looks
    // fixed until the next job is started.
    const old = { ...(JSON.parse(JSON.stringify(AU_SHOP_STANDARDS)) as object), version: 22 };
    const migrated = migrateStandards(old);
    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    const white = migrated.materials.sheets.find((m) => m.id === 'hmr-white-16')!;
    expect(white.sheets.map((s) => [s.length, s.width])).toContainEqual([2410, 1205]);
  });
});
