/**
 * Where the shelf-pin holes fall — the arithmetic on its own.
 *
 * `tests/boring.test.ts` covers this through a built cabinet, which is the right place to check
 * that a row lands on the inside face of the correct panel on both hands. This file tests the
 * numbers directly, for two reasons.
 *
 * The first is **the fixed-shelf split**. Nothing in the model produces a `shelf-fixed` part yet,
 * so there is no cabinet that can exercise it. Writing the splitting anyway is cheap and means the
 * day something does produce one it is already right; testing it through a build would mean
 * inventing a cabinet type to carry the test, which is the tail wagging the dog.
 *
 * The second is that **equidistance is a property, not a number**. It has to hold at every panel
 * height, and the heights where it fails are the ones nobody types into a test: a build test can
 * only ever check the handful of cabinets it builds. Here it can be swept.
 *
 * ── The reference span ─────────────────────────────────────────────────────────────────────
 *
 * A 720 side, 32mm pitch, 96mm clear of each end:
 *
 *   usable   720 − 2 × 96              = 528
 *   holes    floor(528 / 32) + 1       = 17
 *   run      16 × 32                   = 512
 *   first    96 + (528 − 512) / 2      = 104        last  104 + 512 = 616
 *   check    720 − 616                 = 104
 *
 * The 8mm of slack is split rather than left at the top, and that is the whole feature. Left at
 * the top — which is what indexing off the bottom edge does — a panel turned end-for-end has every
 * hole 16mm out, on a part that is otherwise identical either way up.
 */

import { describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { type Span, shelfPinRuns } from '../src/core/rules/shelfPins.ts';
import { withShelfPinClearance } from '../src/core/model/construction.ts';
import { CURRENT_SCHEMA_VERSION, migrateProject } from '../src/core/model/project.ts';
import { buildProject } from '../src/core/rules/build.ts';
import { buildCutlist } from '../src/core/cutlist/cutlist.ts';
import { createSampleKitchen } from '../src/core/project/factory.ts';

const PITCH = mm(32);
const CLEAR = mm(96);
const side = (height: number): Span => ({ lo: mm(0), hi: mm(height) });

/** Every hole a set of runs produces, in order. */
const holes = (runs: ReturnType<typeof shelfPinRuns>, pitch = PITCH): number[] =>
  runs.flatMap((r) => Array.from({ length: r.count }, (_, i) => r.first + i * pitch));

describe('the reference span, as worked in the header', () => {
  it('puts 17 holes from 104 to 616 up a 720 side', () => {
    const runs = shelfPinRuns(side(720), [], PITCH, CLEAR);
    expect(runs).toEqual([{ first: mm(104), count: 17 }]);
    const h = holes(runs);
    expect(h[0]).toBe(104);
    expect(h.at(-1)).toBe(616);
  });

  it('keeps clear of both ends rather than starting a pitch up from the bottom', () => {
    // The old row started at 32 and finished at 672. Both are inside the 96 now kept clear.
    const h = holes(shelfPinRuns(side(720), [], PITCH, CLEAR));
    expect(h).not.toContain(32);
    expect(h).not.toContain(672);
    expect(Math.min(...h)).toBeGreaterThanOrEqual(96);
    expect(720 - Math.max(...h)).toBeGreaterThanOrEqual(96);
  });
});

describe('equidistant, so a flipped panel lines up', () => {
  /**
   * The property, swept.
   *
   * Heights deliberately include ones that are not a whole number of pitches — 717, 1015, 890 —
   * because those are exactly the ones a bottom-indexed row gets wrong, and 720 itself is one of
   * them at 22.5 pitches.
   */
  it('leaves the same gap at both ends at every height', () => {
    for (let height = 300; height <= 2400; height += 1) {
      const runs = shelfPinRuns(side(height), [], PITCH, CLEAR);
      if (runs.length === 0) continue;
      const h = holes(runs);
      const bottom = Math.min(...h);
      const top = height - Math.max(...h);
      expect(bottom, `${height}mm side`).toBeCloseTo(top, 9);
    }
  });

  it('produces the same set of holes when the panel is turned end-for-end', () => {
    // What "equidistant" is actually for, stated as the operation it protects against: mirror
    // every hole about the panel's middle and you must get the same list back.
    for (const height of [720, 717, 900, 1015, 2100]) {
      const h = holes(shelfPinRuns(side(height), [], PITCH, CLEAR));
      const flipped = h.map((y) => height - y).sort((a, b) => a - b);
      expect(flipped.map((y) => Math.round(y * 1e6) / 1e6), `${height}mm side`).toEqual(
        h.map((y) => Math.round(y * 1e6) / 1e6),
      );
    }
  });

  it('does not move the first hole when the pitch changes', () => {
    // The clearance and the centring are about the panel, not about the borer's step. A coarser
    // pitch takes fewer holes over the same run.
    const fine = shelfPinRuns(side(720), [], mm(32), CLEAR);
    const coarse = shelfPinRuns(side(720), [], mm(64), CLEAR);
    expect(fine[0]!.first).toBe(mm(104));
    expect(coarse[0]!.first).toBe(mm(104));
    expect(fine[0]!.count).toBe(17);
    expect(coarse[0]!.count).toBe(9);
  });
});

describe('a fixed shelf splits the run', () => {
  it('bores above it and below it, each centred in its own span', () => {
    // A 2100 side with a 16mm fixed shelf at 1000. Two clear spans, 0–1000 and 1016–2100.
    const runs = shelfPinRuns(side(2100), [{ lo: mm(1000), hi: mm(1016) }], PITCH, CLEAR);
    expect(runs).toHaveLength(2);

    const [lower, upper] = runs;
    // Lower: usable 1000 − 192 = 808; floor(808/32) + 1 = 26 holes over 800; first 96 + 4 = 100.
    expect(lower).toEqual({ first: mm(100), count: 26 });
    expect(1000 - (lower!.first + 25 * 32)).toBeCloseTo(lower!.first - 0, 9);

    // Upper: span 1016–2100, usable 1084 − 192 = 892; 28 holes over 864; first 1112 + 14 = 1126.
    expect(upper).toEqual({ first: mm(1126), count: 28 });
    expect(2100 - (upper!.first + 27 * 32)).toBeCloseTo(upper!.first - 1016, 9);
  });

  it('keeps each piece symmetric in itself, which is all symmetry can mean here', () => {
    /*
     * A panel with an off-centre fixed shelf comes out asymmetric overall, and that is correct
     * rather than a gap: the housing for that shelf is off-centre too, so the panel was never
     * flippable. Symmetry is preserved exactly where it exists.
     */
    const runs = shelfPinRuns(side(2100), [{ lo: mm(600), hi: mm(616) }], PITCH, CLEAR);
    const spans: [number, number][] = [
      [0, 600],
      [616, 2100],
    ];
    runs.forEach((run, i) => {
      const [lo, hi] = spans[i]!;
      const last = run.first + (run.count - 1) * PITCH;
      expect(run.first - lo).toBeCloseTo(hi - last, 9);
    });
  });

  it('ignores a shelf that does not cross the span', () => {
    const clear = shelfPinRuns(side(720), [], PITCH, CLEAR);
    const outside = shelfPinRuns(side(720), [{ lo: mm(900), hi: mm(916) }], PITCH, CLEAR);
    expect(outside).toEqual(clear);
  });

  it('merges shelves that touch or overlap rather than emitting an empty span between them', () => {
    const two = shelfPinRuns(
      side(2100),
      [
        { lo: mm(1000), hi: mm(1016) },
        { lo: mm(1016), hi: mm(1032) },
      ],
      PITCH,
      CLEAR,
    );
    expect(two).toHaveLength(2);
    expect(two[1]!.first).toBeGreaterThanOrEqual(1032 + 96);
  });
});

describe('what it refuses to do', () => {
  it('bores nothing at all when the clearances leave no room', () => {
    // 200 side, 96 clear each end: 8mm of usable span takes one hole, and the slack is split like
    // any other, so it lands at 100 — dead centre — rather than on the clearance line at 96.
    expect(shelfPinRuns(side(200), [], PITCH, CLEAR)).toEqual([{ first: mm(100), count: 1 }]);
    // 190 leaves less than nothing once both clearances are taken, so no hole at all.
    expect(shelfPinRuns(side(190), [], PITCH, CLEAR)).toEqual([]);
  });

  it('puts a single hole in the middle rather than at an arbitrary end', () => {
    // usable 20, one hole: the slack is split, so it lands 10 in from the clearance line.
    expect(shelfPinRuns(side(212), [], PITCH, CLEAR)).toEqual([{ first: mm(106), count: 1 }]);
  });

  it('bores nothing for a pitch of zero rather than looping forever', () => {
    expect(shelfPinRuns(side(720), [], mm(0), CLEAR)).toEqual([]);
  });

  it('takes a zero clearance and still centres', () => {
    // usable 720; floor(720/32) + 1 = 23 holes over 704; first at 8, last at 712.
    expect(shelfPinRuns(side(720), [], PITCH, mm(0))).toEqual([{ first: mm(8), count: 23 }]);
  });

  it('drops a span a fixed shelf has left too small, and keeps the one that survives', () => {
    // A shelf 150 up leaves nothing below it once 96 is kept off each end.
    const runs = shelfPinRuns(side(720), [{ lo: mm(150), hi: mm(166) }], PITCH, CLEAR);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.first).toBeGreaterThanOrEqual(166 + 96);
  });
});

describe('a job saved before the clearance existed', () => {
  const asV13 = (): Record<string, unknown> => {
    const stored = JSON.parse(JSON.stringify(createSampleKitchen())) as Record<string, unknown>;
    stored.schemaVersion = 13;
    stored.constructions = (stored.constructions as Record<string, unknown>[]).map((c) => {
      const { systemHoleEndClearance, ...rest } = c;
      void systemHoleEndClearance;
      return rest;
    });
    return stored;
  };

  it('comes forward with the shipped 96mm filled in', () => {
    const migrated = migrateProject(asV13());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.constructions[0]?.systemHoleEndClearance).toBe(96);
  });

  it('never overwrites a clearance a shop has already set — including zero', () => {
    // Zero is a real answer here (bore the full height, centred), so `?? 96` would be a bug that
    // hides until somebody deliberately asks for no clearance.
    expect(withShelfPinClearance({ systemHoleEndClearance: 32 }).systemHoleEndClearance).toBe(32);
    expect(withShelfPinClearance({ systemHoleEndClearance: 0 }).systemHoleEndClearance).toBe(0);
  });

  it('moves holes and nothing else — every cut size and every part position is unchanged', () => {
    /*
     * The honesty contract, stated as the assertion. This migration *does* move drilling, which
     * `migrateV13toV14` says plainly. What it must not do is change a single part, and a cutlist
     * comparison is the sharpest way to say so: same parts, same sizes, same banding, same
     * quantities.
     */
    const migrated = migrateProject(asV13());
    const fresh = createSampleKitchen();
    const strip = (p: ReturnType<typeof buildCutlist>) =>
      p.map(({ ...line }) => ({ ...line, ids: undefined }));
    expect(strip(buildCutlist(migrated))).toEqual(strip(buildCutlist(fresh)));

    const boxes = (project: typeof fresh) =>
      buildProject(project)
        .flatMap((b) => b.panels)
        .map((p) => ({ name: p.name, placement: p.placement, profile: p.profile }));
    expect(boxes(migrated)).toEqual(boxes(fresh));
  });
});

describe('what a job actually gets bored', () => {
  it('puts the same number of shelf-pin holes in every 720 side of the sample kitchen', () => {
    // Cross-checks the pure arithmetic against the real build: 17 a row, two rows a side.
    const rows = buildProject(createSampleKitchen())
      .flatMap((b) => b.panels)
      .filter((p) => p.role === 'side')
      .flatMap((p) => p.features.filter((f) => f.kind === 'drill-line' && f.purpose === 'shelf-pin'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind === 'drill-line' && r.count === 17)).toBe(true);
  });
});
