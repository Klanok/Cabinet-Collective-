/**
 * What a banquette's cushions cost.
 *
 * ## The reference figure, straight from the shop
 *
 * > "I generally allow $350 per lineal metre — that applies to the base and separately to the back
 * > or any returns, so **1 lineal metre of banquette with base and back would be $700**."
 *
 * That last clause is the whole pricing model in one number, and it is the first assertion below.
 * It is worth stating why it is $700 and not $350: the rate is charged **per cushion**, and a seat
 * and a back over the same metre are two cushions. Get that wrong and every banquette in every
 * quote is out by half.
 *
 * ## The rest of the figures, worked longhand
 *
 * A shipped banquette is 1200 wide and **500 deep** — seat depth, not a base cabinet's 560 — with an
 * 18mm door on a 2mm standoff, the shop's **10mm overhang** and an 80mm back:
 *
 *     finished front    500 + 2 standoff + 18 door      =  520      ← what the cushion measures off
 *     cushion width     flush to both ends              = 1200      ← what the upholsterer makes
 *     cushion depth     520 + 10 proud, from z = 0      =  530
 *     seat              1.200 m × $350                  = $420.00
 *     back              1.200 m × $350                  = $420.00
 *     a return          (530 − 80) = 450mm × $350       = $157.50
 *     seat + back                                       = $840.00
 *
 * **These figures moved in §5.14 and the move is the point.** The cushion used to be held 5mm
 * inside every carcass face, which made it 1190 × 490 and left white carcass on show all round it.
 * It now runs flush to both ends and stands 10mm proud of the finished front — the shop's own
 * answer — so the seat is 10mm longer and 40mm deeper than it was, and costs accordingly. See
 * project v29 → v30, which is the fourth migration in this codebase to make a saved job dearer.
 *
 * A corner unit at the shop's own example — 900 along each wall, 500 deep to both, 150 fillet:
 *
 *     finished fronts  500 + 2 + 18                    =  520
 *     front run, leg A 900 − (520 + 150)               =  230
 *     front run, leg B 900 − (520 + 150)               =  230
 *     fillet arc       150 × π/2                       =  235.62
 *     seat, along its front                            =  695.62mm  = $243.47
 *     back, first wall 900mm                           = $315.00
 *     back, second     900mm                           = $315.00
 *
 * **This is not the figure it used to be**, because the shape underneath it is not the shape it used
 * to be. The old unit was a convex quarter disc and charged `radius × π/2` — the front of a piece
 * that does not exist. §4.19's *reading* survives untouched: a lineal metre of seating is measured
 * along the front of the run. See `model/insideCorner.ts` and §5.13 item 1.
 *
 * The two backs are now **one per wall at its own span**, where they used to both come out one
 * radius long — the same number twice, because the unit was square by construction.
 *
 * **The corner seat measured along its front is a reading, not a fact** — §3's unchecked list.
 * Nobody has put a corner unit to the upholsterer.
 *
 * ## And the thing this whole file is really guarding
 *
 * A cushion nobody can price used to be quoted at **zero**, silently. The tests at the bottom
 * assert that a fabric with no rate produces a *problem in words* rather than a free banquette,
 * because the second one looks exactly like a finished quote.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import type { Project } from '../src/core/model/project.ts';
import { CURRENT_SCHEMA_VERSION, migrateProject } from '../src/core/model/project.ts';
import { cushionChargeTotal, cushionCharges, cushionProblems } from '../src/core/costing/cushionCost.ts';
import { costProject } from '../src/core/costing/costing.ts';
import { createCabinet, createEmptyProject, createSampleKitchen, resetIdCounter } from '../src/core/project/factory.ts';
import { AU_SHOP_STANDARDS, CURRENT_STANDARDS_VERSION, migrateStandards } from '../src/core/standards/standards.ts';

let project: Project;

const withCabinets = (...args: Parameters<typeof createCabinet>[0][]): Project => ({
  ...project,
  cabinets: args.map((a) => createCabinet(a, project.defaults, project.constructions)),
});

/** A banquette of a stated width, with whatever cushion options the test is about. */
const banquette = (width: number, options: Record<string, unknown> = {}): Project =>
  withCabinets({ typeId: 'banquette', name: 'BQ1', width: mm(width), x: mm(0), options });

const dollars = (cents: number): number => cents / 100;

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Cushion cost test');
});

/*
 * ── The shop's own worked example ─────────────────────────────────────────────────────────────
 */

describe('the reference figure', () => {
  it('charges one lineal metre with a base and a back at $700', () => {
    /*
     * Stated as the shop stated it: one metre *of cushion*. Since §5.14 the seat runs flush to
     * both ends, so a 1000 cabinet is exactly the 1000mm of cushion the figure is about. It used
     * to take a 1010 cabinet to get there, which is the 5mm inset each side, now gone.
     */
    const job = banquette(1000, { hasBackCushion: true });
    const [charge] = cushionCharges(job);

    expect(charge!.lines.map((l) => l.label)).toEqual(['Seat', 'Back']);
    expect(charge!.lines.every((l) => l.linealM === 1)).toBe(true);
    expect(dollars(charge!.totalExGst)).toBe(700);
  });

  it('is $700 because it is two cushions, not one metre', () => {
    // The failure this guards: one charge for the run instead of one per piece.
    const job = banquette(1000, { hasBackCushion: true });
    const [charge] = cushionCharges(job);
    expect(charge!.lines).toHaveLength(2);
    expect(dollars(charge!.lines[0]!.costExGst)).toBe(350);
    expect(dollars(charge!.lines[1]!.costExGst)).toBe(350);
  });

  it('charges a seat on its own when the back is switched off', () => {
    const job = banquette(1000, { hasBackCushion: false });
    const [charge] = cushionCharges(job);
    expect(charge!.lines.map((l) => l.label)).toEqual(['Seat']);
    expect(dollars(charge!.totalExGst)).toBe(350);
  });
});

/*
 * ── The shipped banquette, longhand ───────────────────────────────────────────────────────────
 */

describe('a shipped 1200 banquette', () => {
  it('measures the cushion, not the cabinet', () => {
    const [charge] = cushionCharges(banquette(1200));
    // Flush to both ends, so the cushion is the cabinet's width. It was 1190 before §5.14.
    expect(charge!.lines[0]!.linealMm).toBe(1200);
    expect(dollars(charge!.lines[0]!.costExGst)).toBe(420);
    expect(dollars(charge!.totalExGst)).toBe(840);
  });

  it('adds a return that stops short of the back cushion', () => {
    const [charge] = cushionCharges(banquette(1200, { leftEndCushion: true }));
    // A banquette is 500 deep, not a base cabinet's 560. The cushion runs from the back wall to
    // 10mm proud of the finished front — 520 + 10 = 530 — less the 80mm back the return starts in
    // front of = 450. It was 410 while the cushion sat inside the carcass.
    const ret = charge!.lines.find((l) => l.kind === 'return')!;
    expect(ret.label).toBe('Left return');
    expect(ret.linealMm).toBe(450);
    expect(dollars(ret.costExGst)).toBe(157.5);
    expect(dollars(charge!.totalExGst)).toBe(840 + 157.5);
  });

  it('charges both returns when both ends are cushioned, and they match', () => {
    const [charge] = cushionCharges(
      banquette(1200, { leftEndCushion: true, rightEndCushion: true }),
    );
    const returns = charge!.lines.filter((l) => l.kind === 'return');
    expect(returns).toHaveLength(2);
    // Symmetrical on a square banquette — the two ends are the same cushion.
    expect(returns[0]!.linealMm).toBe(returns[1]!.linealMm);
  });

  it('charges no returns without a back cushion, because a return is part of the back', () => {
    const [charge] = cushionCharges(
      banquette(1200, { hasBackCushion: false, leftEndCushion: true, rightEndCushion: true }),
    );
    expect(charge!.lines.map((l) => l.kind)).toEqual(['seat']);
  });
});

/*
 * ── The corner unit ───────────────────────────────────────────────────────────────────────────
 */

describe('the inside corner unit', () => {
  const corner = (width = 900, depth = 900): Project =>
    withCabinets({ typeId: 'banquette-corner', name: 'BQC1', width: mm(width), depth: mm(depth), x: mm(0) });

  it('charges the seat along its two fronts and the fillet between them', () => {
    const [charge] = cushionCharges(corner());
    const seat = charge!.lines[0]!;
    expect(seat.label).toBe('Corner seat');
    expect(seat.linealMm).toBeCloseTo(230 + 230 + (150 * Math.PI) / 2, 1);
    expect(dollars(seat.costExGst)).toBeCloseTo(243.47, 1);
  });

  it('charges one back per wall, each at its own span', () => {
    /*
     * The two legs are independent now. On the old quarter disc both backs came out one radius
     * long, which was the same number twice — so a corner with unequal spans under-bought one of
     * them, and nothing in the quote said which.
     */
    const [charge] = cushionCharges(corner(1500, 900));
    const backs = charge!.lines.filter((l) => l.kind === 'back');
    expect(backs).toHaveLength(2);
    expect(backs.map((b) => b.linealMm)).toEqual([mm(1500), mm(900)]);
  });

  it('charges the corner seat more than one front and less than the whole footprint', () => {
    // The same sanity bracket §4.19 put on the old reading, restated for a shape that exists.
    const [charge] = cushionCharges(corner());
    const seat = charge!.lines[0]!;
    expect(seat.linealMm).toBeGreaterThan(230);
    expect(seat.linealMm).toBeLessThan(900 + 900);
  });
});

/*
 * ── It reaches the quote ──────────────────────────────────────────────────────────────────────
 */

describe('on the quote', () => {
  it('is its own line and is inside the material cost', () => {
    const job = banquette(1000);
    const cost = costProject(job);
    expect(dollars(cost.cushionCost)).toBe(700);
    expect(cost.materialCost).toBeGreaterThanOrEqual(cost.cushionCost);
  });

  it('moves the total by the cushions and nothing else', () => {
    const job = banquette(1000);
    const withNoRate: Project = {
      ...job,
      materials: {
        ...job.materials,
        upholstery: (job.materials.upholstery ?? []).map((u) => ({ ...u, charges: undefined })),
      },
    };
    const difference = costProject(job).totalCost - costProject(withNoRate).totalCost;
    expect(dollars(difference)).toBe(700);
  });

  it('produces no parts — the shop supplies templates, not cushions', () => {
    const job = banquette(1000);
    const withCushions = costProject(job);
    const noCushionOptions = banquette(1000, { hasBackCushion: false });
    // Switching the back off changes the price and not the part count: nothing here is cut.
    expect(costProject(noCushionOptions).panelCount).toBe(withCushions.panelCount);
    expect(costProject(noCushionOptions).cushionCost).toBeLessThan(withCushions.cushionCost);
  });

  it('leaves a job with no banquette in it completely alone', () => {
    resetIdCounter();
    const kitchen = createSampleKitchen(AU_SHOP_STANDARDS);
    expect(cushionCharges(kitchen)).toEqual([]);
    expect(costProject(kitchen).cushionCost).toBe(0);
  });
});

/*
 * ── A cushion nobody can price ────────────────────────────────────────────────────────────────
 *
 * The fault §5.11 actually reported. A missing line that announces itself is a job to finish; a
 * missing line that quotes at zero is a banquette sold for hundreds less than it costs.
 */

describe('a fabric with no upholsterer’s rate', () => {
  const rateless = (): Project => {
    const job = banquette(1000);
    return {
      ...job,
      materials: {
        ...job.materials,
        upholstery: (job.materials.upholstery ?? []).map((u) => ({ ...u, charges: undefined })),
      },
    };
  };

  it('is reported in words, naming the cabinet', () => {
    const problems = cushionProblems(rateless());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('BQ1');
    expect(problems[0]).toContain('quoted at nothing');
  });

  it('reaches the quote’s own warnings, not just a function nobody calls', () => {
    expect(costProject(rateless()).warnings.some((w) => w.includes('BQ1'))).toBe(true);
  });

  it('charges nothing rather than guessing a rate', () => {
    expect(cushionChargeTotal(cushionCharges(rateless()))).toBe(0);
  });

  it('says nothing at all about a job with no banquettes', () => {
    resetIdCounter();
    expect(cushionProblems(createSampleKitchen(AU_SHOP_STANDARDS))).toEqual([]);
  });
});

/*
 * ── The migration, and the re-price it admits to ──────────────────────────────────────────────
 *
 * The third migration in this codebase to make a saved job dearer, after v9 and v11. Both halves
 * are asserted separately, which is the standard §2 sets for exactly this.
 */

describe('migrating a job saved before cushions were costed', () => {
  /** A v26 job: current in every respect except that its fabric carries no rate. */
  const asV26 = (job: Project): Record<string, unknown> => ({
    ...(JSON.parse(JSON.stringify(job)) as object),
    schemaVersion: 26,
    materials: {
      ...JSON.parse(JSON.stringify(job.materials)),
      upholstery: (job.materials.upholstery ?? []).map((u) => {
        const { charges: _c, indicativePricing: _i, ...rest } = u;
        return rest;
      }),
    },
  });

  it('gives a banquette job the rate it always should have had, and it gets dearer', () => {
    const job = banquette(1000);
    const migrated = migrateProject(asV26(job));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // The half that admits to re-pricing: $700 of cushions the old quote did not mention.
    expect(dollars(costProject(migrated).cushionCost)).toBe(700);
  });

  it('changes a job with no banquette in it by nothing at all, to the cent', () => {
    resetIdCounter();
    const kitchen = createSampleKitchen(AU_SHOP_STANDARDS);
    const before = costProject(kitchen).totalIncGst;
    const migrated = migrateProject(asV26(kitchen));
    expect(costProject(migrated).totalIncGst).toBe(before);
  });

  it('never overwrites a rate the shop has set for itself', () => {
    const job = banquette(1000);
    const edited = {
      ...asV26(job),
      materials: {
        ...(asV26(job).materials as object),
        upholstery: (job.materials.upholstery ?? []).map((u) => ({
          ...u,
          charges: { perLinealMetreExGst: 50_000 },
        })),
      },
    };
    const migrated = migrateProject(edited);
    // $500/m, the shop's own, not the shipped $350.
    expect(dollars(costProject(migrated).cushionCost)).toBe(1000);
  });

  it('carries the standards forward too', () => {
    const old = { ...JSON.parse(JSON.stringify(AU_SHOP_STANDARDS)), version: 19 };
    const migrated = migrateStandards(old);
    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    expect(migrated.materials.upholstery?.[0]?.charges?.perLinealMetreExGst).toBe(35_000);
  });
});
