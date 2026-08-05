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
 * ## The allowance is a rule about a class of board, so every board of that class takes it
 *
 * ```
 *   carcass and melamine   +10 / +5     2400 × 1200 → 2410 × 1205    3600 × 1800 → 3610 × 1805
 *   any MDF board          +20 / +10    2400 × 1200 → 2420 × 1210    3600 × 1800 → 3620 × 1810
 * ```
 *
 * v32 moved only the size the machine had measured and left the rest at the usable area, on the
 * argument that applying a measured rule to an unmeasured sheet is a guess in the direction that
 * cuts a part short. **The shop overruled that**, and the correction is worth keeping because the
 * app had been applying the rule and disclaiming it at the same time:
 *
 * > *"the sizes are not to be trusted … as per my previous advice allow 20mm in length and 10mm in
 * > width for all mdf prefinished boards. Why was that advice ignored?"*
 *
 * Suppliers publish the nominal, so the published figure everyone was waiting on was never coming.
 *
 * ## And the last two classes have answers now, neither of them a trim
 *
 * > *"ply is generally tighter allow 2410 X 1205. laminate is generally 3600 X 1350 for polytec.
 * > Laminex is generally 3600 X 1500."*
 *
 * **Ply shrinks** — 2440 × 1220 quoted, 2410 × 1205 given — which makes it the only class here
 * whose real sheet is smaller than its stated one, and the trap in the set: a rule remembered as
 * "the real sheet is bigger" cuts a ply part short. **The laminate is a correction rather than an
 * allowance**: 3660 × 1830 and 2440 × 1220 are board-ish footprints neither supplier sells a facing
 * sheet in.
 *
 * So nothing is unconfirmed and the list is gone. It had also never been rendered anywhere, which
 * is its own lesson — see the note in `materials.au.ts` where it used to live.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  migrateProject,
} from '../src/core/model/project.ts';
import {
  AU_SHEET_MATERIALS,
  MDF_BOARDS,
  PLY_BOARDS,
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

  it('takes the shop’s allowance on the large board too, at its own class’s figure', () => {
    // The rule is stated per class of board rather than per size, so both sizes of both classes
    // take it. A carcass sheet at 3610 × 1805; the same nominal board in MDF at 3620 × 1810.
    expect(sizesOf('hmr-white-16')).toContainEqual([3610, 1805]);
    expect(sizesOf('hmr-white-16')).not.toContainEqual([3600, 1800]);
    expect(sizesOf('mdf-raw-18')).toContainEqual([3620, 1810]);
  });

  it('gives imported ply less than it is sold by — the one class that shrinks', () => {
    /*
     * **The trap in the whole set.** Every other class grows over its quoted size; ply is quoted at
     * 2440 × 1220 and gives 2410 × 1205. Stating it at the quoted figure is the direction that cuts
     * a part short, which is why this is asserted on all four ply products rather than on one.
     */
    for (const id of PLY_BOARDS) {
      expect(sizesOf(id)).toContainEqual([2410, 1205]);
      expect(sizesOf(id)).not.toContainEqual([2440, 1220]);
    }
  });

  it('cuts the finish laminate from the sheet its own brand sells', () => {
    /*
     * **One record per brand, because the laminate is a decor**: *"the brand being used depends on
     * the project as it's a decor, a choice the client would make for the finish."* Both sizes on
     * one record let the cheapest-buy search charge a Laminex sheet on an all-Polytec job.
     */
    expect(sizesOf('laminate-polytec-1mm')).toEqual([[3600, 1350]]);
    expect(sizesOf('laminate-laminex-1mm')).toEqual([[3600, 1500]]);
    // $60/m² on both: 4.86m² → $291.60 and 5.40m² → $324.00.
    const priceOf = (id: string) =>
      AU_SHEET_MATERIALS.find((m) => m.id === id)!.sheets[0]!.priceExGst;
    expect(priceOf('laminate-polytec-1mm')).toBe(29_160);
    expect(priceOf('laminate-laminex-1mm')).toBe(32_400);
    // And the brand is on the record, because that is what costing resolves against.
    expect(AU_SHEET_MATERIALS.find((m) => m.id === 'laminate-laminex-1mm')!.brand).toBe('Laminex');
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

  it('grows the large carcass sheet as well, at the carcass figure and not the MDF one', () => {
    /*
     * The invariant that keeps this from being a blanket resize: the table is keyed by class *and*
     * size, so one nominal board gives two answers. 3620 × 1810 here would be the MDF allowance on
     * a carcass sheet — 10mm of board that is not there, which is the direction that cuts short.
     */
    resetIdCounter();
    const migrated = migrateProject(asV31(createSampleKitchen(AU_SHOP_STANDARDS)));
    const white = migrated.materials.sheets.find((m) => m.id === 'hmr-white-16')!;
    expect(white.sheets.map((s) => [s.length, s.width])).toContainEqual([3610, 1805]);
    expect(white.sheets.map((s) => [s.length, s.width])).not.toContainEqual([3620, 1810]);
    expect(white.sheets.map((s) => [s.length, s.width])).not.toContainEqual([3600, 1800]);
  });

  it('reaches a job that had already been repaired once, at v32', () => {
    /*
     * **The half that decides whether this reaches anybody.** v32 ran the same repair, so a job
     * saved since then is already at the current version with the old large sheet in it and nothing
     * left to fix it — which is §4.22's fault exactly, one chain along. v33 exists to re-run it.
     */
    resetIdCounter();
    const v32 = { ...asV31(createSampleKitchen(AU_SHOP_STANDARDS)), schemaVersion: 32 };
    const migrated = migrateProject(v32);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const white = migrated.materials.sheets.find((m) => m.id === 'hmr-white-16')!;
    expect(white.sheets.map((s) => [s.length, s.width])).toContainEqual([3610, 1805]);
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
    const old = JSON.parse(JSON.stringify(
      migrateProject({ ...asV31(createSampleKitchen(AU_SHOP_STANDARDS)), schemaVersion: 33 }),
    )) as Project;
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
          sheetSizes: { 'hmr-white-16': '2400x1200', 'hmr-white-18': '3600x1800' },
        },
      },
    };
    const migrated = migrateProject(withChoice);
    expect(migrated.settings.nesting.sheetSizes).toEqual({
      'hmr-white-16': '2410x1205',
      // Both sizes move now, so both choices have to move with them.
      'hmr-white-18': '3610x1805',
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

/**
 * The allowance is **material dependent**, which is the shop's own correction to the rule.
 *
 * > *"laminex and polytecs boards are material dependant. Generally allow 20mm in length and 10mm
 * > in width for MD finish boards."*
 *
 * So `2400 × 1200` is **2410 × 1205** on a carcass board and **2420 × 1210** on an MD finish one.
 * A single global rule would have put every decorative door board 10mm short on the length and 5 on
 * the width — a part per sheet on a long run.
 *
 * The set of "MD finish boards" is a **list**, not a rule over substrate strings: the phrase is a
 * trade one and the set it names is a judgement, so it is written down where it can be checked at a
 * glance and corrected in one line.
 */
describe('the MDF allowance', () => {
  it('runs 20 and 10 where a carcass board runs 10 and 5', () => {
    const walnut = AU_SHEET_MATERIALS.find((m) => m.id === 'poly-florentine-walnut-16')!;
    expect(walnut.sheets.map((s) => [s.length, s.width])).toContainEqual([2420, 1210]);

    const white = AU_SHEET_MATERIALS.find((m) => m.id === 'hmr-white-16')!;
    expect(white.sheets.map((s) => [s.length, s.width])).toContainEqual([2410, 1205]);
  });

  it('carries the long Polytec board, now that it is confirmed stock', () => {
    /*
     * *"3115 is a typical polytec size."* The machine's MDF door programs ran on one and it was
     * deliberately left out until that answer arrived — a stock size nobody has confirmed puts a
     * board on an order that may not exist. Stated as measured, so it takes no allowance on top.
     */
    const door = AU_SHEET_MATERIALS.find((m) => m.id === 'poly-classic-white-door-18')!;
    expect(door.sheets.map((s) => [s.length, s.width])).toContainEqual([3115, 1205]);
  });

  it('takes raw MDF too, because the margin is a pressing trim rather than a finish', () => {
    /*
     * The shop's second answer, and it is the one the physics wanted: *"yes raw mdf is the same 20
     * and 10."* A board is cut to its nominal after pressing, and whether a decor goes on
     * afterwards has nothing to do with it. The first reading — *"MD **finish** boards"* — had raw
     * MDF on the conservative figure, which was the safe place to be wrong while nobody had said.
     */
    expect(MDF_BOARDS).toContain('mdf-raw-18');
    const raw = AU_SHEET_MATERIALS.find((m) => m.id === 'mdf-raw-18')!;
    expect(raw.sheets.map((s) => [s.length, s.width])).toContainEqual([2420, 1210]);
    expect(raw.sheets.map((s) => [s.length, s.width])).toContainEqual([3620, 1810]);
  });

  it('still leaves the 1mm laminate off, because it is not a board', () => {
    // It carries an MDF substrate, so a rule over substrate strings would have swept it in — which
    // is the whole argument for `MDF_BOARDS` being a list.
    expect(MDF_BOARDS).not.toContain('laminate-1mm');
  });

  it('grows a saved job by the figure its own material takes, not by one figure', () => {
    /*
     * **The assertion that says "material dependent" reached the migration.** It was keyed on the
     * size alone for one commit, before the shop answered — and a size-keyed map cannot give two
     * answers for 2400 × 1200. Both halves are checked in the same job, because getting one right
     * and the other wrong is what a shared table would have done.
     */
    resetIdCounter();
    const raw = JSON.parse(JSON.stringify(createSampleKitchen(AU_SHOP_STANDARDS))) as Record<string, unknown>;
    const materials = raw.materials as Record<string, unknown>;
    const old = {
      ...raw,
      schemaVersion: 31,
      materials: {
        ...materials,
        sheets: (materials.sheets as Record<string, unknown>[]).map((m) => ({
          ...m,
          sheets: (m.sheets as Record<string, unknown>[]).map((s) =>
            (s.length === 2410 && s.width === 1205) || (s.length === 2420 && s.width === 1210)
              ? { ...s, length: 2400, width: 1200 }
              : s,
          ),
        })),
      },
    };
    const migrated = migrateProject(old);
    const sizes = (id: string) =>
      migrated.materials.sheets.find((m) => m.id === id)!.sheets.map((s) => [s.length, s.width]);
    expect(sizes('hmr-white-16')).toContainEqual([2410, 1205]);
    expect(sizes('poly-florentine-walnut-16')).toContainEqual([2420, 1210]);
  });
});

/* ── The last two classes, and the migration that carries them ───────────────────────────────── */

describe('a job saved before the ply and laminate figures arrived', () => {
  /**
   * A v33 job: current in every respect except the two footprints nobody had an answer for.
   *
   * **The laminate has to be put back deliberately.** A fresh sample kitchen carries the two
   * branded records, so a fixture that only rewrote a `laminate-1mm` would rewrite nothing and
   * assert against the shipped library — which is a test that passes on any migration at all.
   */
  const asV33 = (job: Project, legacyLaminateSheets?: Record<string, unknown>[]): Record<string, unknown> => {
    const raw = JSON.parse(JSON.stringify(job)) as Record<string, unknown>;
    const materials = raw.materials as Record<string, unknown>;
    const sheets = (materials.sheets as Record<string, unknown>[])
      .filter((m) => !String(m.id).startsWith('laminate-'))
      .map((m) => {
        if (!PLY_BOARDS.includes(String(m.id))) return m;
        return {
          ...m,
          sheets: (m.sheets as Record<string, unknown>[]).map((sh) =>
            sh.length === 2410 && sh.width === 1205 ? { ...sh, length: 2440, width: 1220 } : sh,
          ),
        };
      });
    return {
      ...raw,
      schemaVersion: 33,
      materials: {
        ...materials,
        sheets: [
          ...sheets,
          {
            id: 'laminate-1mm',
            brand: 'Polytec',
            decor: 'Finish laminate 1mm',
            substrate: 'MDF',
            thickness: 1,
            grain: 'none',
            colour: '#cfc8bd',
            decorFaces: 1,
            indicativePricing: true,
            // The footprints v34 replaces, at the $60/m² they shipped at.
            sheets: legacyLaminateSheets ?? [
              { length: 3660, width: 1830, priceExGst: 40_187 },
              { length: 2440, width: 1220, priceExGst: 17_861 },
            ],
          },
        ],
      },
    };
  };

  it('gives every ply sheet the tighter figure, and none of them the board rule', () => {
    resetIdCounter();
    const migrated = migrateProject(asV33(createSampleKitchen(AU_SHOP_STANDARDS)));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    for (const id of PLY_BOARDS) {
      const ply = migrated.materials.sheets.find((m) => m.id === id);
      if (!ply) continue;
      expect(ply.sheets.map((sh) => [sh.length, sh.width])).toContainEqual([2410, 1205]);
      // 2450 × 1230 would be the carcass rule applied to ply: the wrong direction on the one class
      // that shrinks, and the reason `realSizesFor` routes three classes rather than two.
      expect(ply.sheets.map((sh) => [sh.length, sh.width])).not.toContainEqual([2450, 1230]);
    }
  });

  it('keeps the laminate’s rate per square metre rather than its price per sheet', () => {
    /*
     * **The half that would have invented a price.** These are different sheets, not the same sheet
     * measured better, so carrying $401.87 onto a 5.40m² sheet would quietly make the laminate
     * $74/m². The rate is what the shop set; the area is what was wrong.
     */
    resetIdCounter();
    const migrated = migrateProject(asV33(createSampleKitchen(AU_SHOP_STANDARDS)));
    // And the one record has become one per brand — v35, because the laminate is a decor.
    expect(migrated.materials.sheets.some((m) => m.id === 'laminate-1mm')).toBe(false);
    const poly = migrated.materials.sheets.find((m) => m.id === 'laminate-polytec-1mm')!;
    const lam = migrated.materials.sheets.find((m) => m.id === 'laminate-laminex-1mm')!;
    expect([poly.sheets[0]!.length, poly.sheets[0]!.width]).toEqual([3600, 1350]);
    expect([lam.sheets[0]!.length, lam.sheets[0]!.width]).toEqual([3600, 1500]);
    // $60/m² either way: 4.86m² → $291.60 and 5.40m² → $324.00.
    expect(poly.sheets[0]!.priceExGst).toBe(29_160);
    expect(lam.sheets[0]!.priceExGst).toBe(32_400);
  });

  it('follows a rate the shop has edited, instead of the shipped one', () => {
    // The reason the rate carries rather than the price: a shop that put its own $75/m² in keeps it,
    // through both the footprint correction and the split into brands.
    resetIdCounter();
    const withOwnRate = asV33(createSampleKitchen(AU_SHOP_STANDARDS), [
      { length: 2440, width: 1220, priceExGst: 22_326 }, // $75/m²
    ]);
    const migrated = migrateProject(withOwnRate);
    const poly = migrated.materials.sheets.find((m) => m.id === 'laminate-polytec-1mm')!;
    const lam = migrated.materials.sheets.find((m) => m.id === 'laminate-laminex-1mm')!;
    // 4.86m² and 5.40m² at the shop's own $75/m² = $364.50 and $405.00.
    expect(poly.sheets[0]!.priceExGst).toBe(36_450);
    expect(lam.sheets[0]!.priceExGst).toBe(40_500);
  });

  it('repairs the shop standards too', () => {
    const old = { ...(JSON.parse(JSON.stringify(AU_SHOP_STANDARDS)) as object), version: 24 };
    const migrated = migrateStandards(old);
    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    const bendy = migrated.materials.sheets.find((m) => m.id === 'bendy-ply-8')!;
    expect(bendy.sheets.map((sh) => [sh.length, sh.width])).toContainEqual([2410, 1205]);
  });
});
