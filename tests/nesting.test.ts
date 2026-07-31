/**
 * Nesting — Phase 3. The ten assertions, written before the packer was.
 *
 * The thing worth saying first: **a nest is easy to look at and hard to check.** A sheet diagram
 * with a part 8mm out of place, or two parts overlapping by a millimetre, or a cut that no saw
 * could make, looks exactly as convincing as a correct one. That is the same lesson §4.4 learned
 * from a former's thickness axis and §4.6 learned from a mounting plate bored off the wrong edge —
 * the count and the sizes were right both times and only the coordinate was wrong. So nothing here
 * asserts that a nest "looks reasonable". Every test asks a question with a number for an answer.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ## The kerf figure, longhand
 *
 * A sheet 1200 × 400 and two parts 600 × 400, no edge trim.
 *
 *   with no blade      600 + 600            = 1200   exactly one sheet
 *   with a 3.2 blade   600 + 3.2 + 600      = 1203.2  which is 3.2 more than there is
 *
 * So the same two parts need one sheet or two depending only on whether the saw is admitted to
 * remove material. This is the cheapest possible statement of why kerf is not an optional refinement
 * and why it does not ship at zero.
 *
 * ## The sample kitchen, longhand
 *
 * 87 parts across two materials.
 *
 *   White HMR particleboard 16mm    71 parts   17.80m²   4 sheets of 3600×1800 at $138.00 = $552.00
 *   Polytec Classic White 18mm      16 parts    4.85m²   1 sheet  of 3600×1800 at $168.00 = $168.00
 *                                                                          sheet goods      $720.00
 *
 * A 3600×1800 sheet is 6.48m², so the carcass board comes out at 17.80 ÷ (4 × 6.48) = 68.7% yield
 * and the door board at 4.85 ÷ 6.48 = 74.8%. Both are *measured*. The figure they replace was
 * `sheetWastageFactor` at 0.15 — an assumed 85% on every material, every part size and every job.
 *
 * What that estimate charged, for comparison: 17.80 ÷ 0.85 = 20.94m² of carcass at $21.296/m² =
 * $445.94, plus 4.85 ÷ 0.85 = 5.71m² of door board at $25.926/m² = $147.99, for $593.93. That is
 * **3.23 sheets' worth of money** on a job whose own materials table said four. Nobody sells a third
 * of a sheet, so the difference is not an argument about how much waste to assume — it is board
 * this job was never being charged for.
 *
 * ## Grain, the six cases
 *
 * Two records answer half the question each. The board says whether it has a direction and which
 * way it runs; the part says whether it cares.
 *
 *   board 'none'   + anything                 both orientations — nothing constrains it
 *   board 'length' + part 'length-along-grain' as-cut  — the part's length already runs with it
 *   board 'length' + part 'width-along-grain'  turned  — the part must be laid across
 *   board 'width'  + part 'length-along-grain' turned
 *   board 'width'  + part 'width-along-grain'  as-cut
 *   any board      + part 'any'                both
 *
 * The middle four are the reason this is a lookup and not a "may it rotate?" boolean: two of them
 * *require* rotation, and a nester that only knows how to decline it lays those parts the wrong way
 * round while passing every test that checks the part fits on the sheet.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import {
  DEFAULT_STRATEGY,
  type PackablePart,
  type Rect,
  packBest,
  packSheets,
  replayCuts,
  usableArea,
} from '../src/core/nest/guillotine.ts';
import {
  type MaterialNest,
  type ProjectNest,
  nestParts,
  nestProject,
  orientationsFor,
  usableOffcuts,
} from '../src/core/nest/nest.ts';
import { costProject } from '../src/core/costing/costing.ts';
import { cutSequenceCsv, nestCsv } from '../src/core/cutlist/export.ts';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_NESTING_SETTINGS,
  type Project,
  migrateProject,
} from '../src/core/model/project.ts';
import { CURRENT_STANDARDS_VERSION, migrateStandards } from '../src/core/standards/standards.ts';
import { AU_SHOP_STANDARDS } from '../src/core/standards/standards.ts';
import { buildProject } from '../src/core/rules/build.ts';
import { buildRunUnits } from '../src/core/rules/runUnits.ts';
import { panelExtent } from '../src/core/model/panel.ts';
import type { CabinetOptions } from '../src/core/model/cabinet.ts';
import {
  createCabinet,
  createEmptyProject,
  createSampleKitchen,
  resetIdCounter,
} from '../src/core/project/factory.ts';

const SHEET_M2 = (3600 * 1800) / 1_000_000;

/** Do two blanks overlap? Touching along an edge is not overlapping — that is where the cut is. */
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.length - 1e-6 &&
  b.x < a.x + a.length - 1e-6 &&
  a.y < b.y + b.width - 1e-6 &&
  b.y < a.y + a.width - 1e-6;

const rectKey = (r: Rect) =>
  `${r.x.toFixed(4)},${r.y.toFixed(4)},${r.length.toFixed(4)},${r.width.toFixed(4)}`;

/** Every problem a nest could have that is checkable without knowing the job. */
const auditNest = (nest: ProjectNest): string[] => {
  const problems: string[] = [];
  for (const material of nest.byMaterial) {
    for (const sheet of material.sheets) {
      const blanks = sheet.placements.map((p) => p.at);
      blanks.forEach((a, i) => {
        if (
          a.x < sheet.usable.x - 1e-6 ||
          a.y < sheet.usable.y - 1e-6 ||
          a.x + a.length > sheet.usable.x + sheet.usable.length + 1e-6 ||
          a.y + a.width > sheet.usable.y + sheet.usable.width + 1e-6
        ) {
          problems.push(`${material.label} sheet ${sheet.index}: a blank hangs off the board`);
        }
        for (const b of blanks.slice(i + 1)) {
          if (overlaps(a, b)) {
            problems.push(`${material.label} sheet ${sheet.index}: two blanks overlap`);
          }
        }
      });
    }
  }
  return problems;
};

let sample: Project;

beforeEach(() => {
  resetIdCounter();
  sample = createSampleKitchen();
});

// ── 1. Nothing is dropped ────────────────────────────────────────────────────────────────

describe('every part gets a home, or is reported', () => {
  it('places every part on the sample kitchen exactly once', () => {
    const nest = nestProject(sample);
    const wanted = nestParts(sample).map((p) => p.panelId).sort();

    const placed = nest.byMaterial
      .flatMap((m) => m.sheets.flatMap((s) => s.placements.map((p) => p.partId)))
      .concat(nest.byMaterial.flatMap((m) => m.oversize.map((p) => p.panelId)))
      .sort();

    expect(placed).toEqual(wanted);
    expect(wanted.length).toBe(87);
    // The sample kitchen is cut entirely from stock sheets — nothing on it is oversize.
    expect(nest.byMaterial.flatMap((m) => m.oversize)).toEqual([]);
  });

  it('counts the same parts the cutlist and the quote count', () => {
    const panels = [
      ...buildProject(sample).flatMap((b) => b.panels),
      ...buildRunUnits(sample).flatMap((u) => u.panels),
    ];
    expect(nestParts(sample).length).toBe(panels.length);
    expect(costProject(sample).panelCount).toBe(panels.length);
  });

  it('reports a part too big for any sheet rather than losing it', () => {
    // A 4000mm bench, on a material whose largest sheet is 3600 long. It cannot be cut as drawn.
    const project: Project = {
      ...createEmptyProject('Oversize'),
      cabinets: [
        createCabinet({
          typeId: 'custom',
          name: 'Long bench',
          width: mm(4000),
          height: mm(720),
          depth: mm(560),
          x: mm(0),
        }),
      ],
    };
    const nest = nestProject(project);
    const oversize = nest.byMaterial.flatMap((m) => m.oversize);
    expect(oversize.length).toBeGreaterThan(0);
    expect(nest.warnings.some((w) => w.includes('too big'))).toBe(true);
    // Charged a sheet each, as a floor. Charging nothing would take the part off the quote.
    for (const m of nest.byMaterial) {
      expect(m.sheetCount).toBe(m.sheets.length + m.oversize.length);
    }
  });
});

// ── 2. Nothing overlaps, nothing hangs off ───────────────────────────────────────────────

describe('the nest is physically possible', () => {
  it('lays no two blanks over each other, and none off the board', () => {
    expect(auditNest(nestProject(sample))).toEqual([]);
  });

  it('holds on a shaker kitchen too, where every front is machined', () => {
    const shaker: Project = {
      ...sample,
      defaults: { ...sample.defaults, doorStyleId: 'shaker-57' },
    };
    expect(auditNest(nestProject(shaker))).toEqual([]);
    // A door style is machining, not geometry — so the nest is the same nest. §4.3's claim,
    // checked one layer further downstream than it was before.
    expect(nestProject(shaker).sheetCount).toBe(nestProject(sample).sheetCount);
  });

  it('respects an edge trim by starting the first cut inside it', () => {
    const trimmed: Project = {
      ...sample,
      settings: {
        ...sample.settings,
        nesting: { ...sample.settings.nesting, sheetEdgeTrim: mm(10) },
      },
    };
    const nest = nestProject(trimmed);
    expect(auditNest(nest)).toEqual([]);
    for (const m of nest.byMaterial) {
      for (const sheet of m.sheets) {
        expect(sheet.usable.x).toBe(10);
        expect(sheet.usable.y).toBe(10);
        expect(sheet.usable.length).toBe(m.sheet.length - 20);
        expect(sheet.usable.width).toBe(m.sheet.width - 20);
      }
    }
  });
});

// ── 3. The cut sequence proves it is cuttable ────────────────────────────────────────────

describe('the cut sequence', () => {
  /**
   * The load-bearing test of the phase.
   *
   * `replayCuts` knows nothing about the tree the packer built — only the sheet it started with,
   * the list of cuts and the kerf. It puts the sheet on the bench and follows the instructions. If
   * any cut names a piece that is not there, or lands outside the piece it names, or fails to span
   * it, the replay says so. Anything left at the end has to be exactly the parts and the offcuts.
   */
  it('replays back to exactly the parts and the offcuts, on every sheet of the sample kitchen', () => {
    const nest = nestProject(sample);
    let sheetsChecked = 0;

    for (const material of nest.byMaterial) {
      for (const sheet of material.sheets) {
        const { pieces, problems } = replayCuts(sheet.usable, sheet.cuts, nest.kerf);
        expect(problems).toEqual([]);

        const produced = pieces.map(rectKey).sort();
        const expected = [
          ...sheet.placements.map((p) => rectKey(p.at)),
          ...sheet.offcuts.map(rectKey),
        ].sort();
        expect(produced).toEqual(expected);
        sheetsChecked += 1;
      }
    }
    expect(sheetsChecked).toBe(5);
  });

  it('makes every cut span the whole piece it is on — that is what a guillotine cut is', () => {
    const nest = nestProject(sample);
    for (const material of nest.byMaterial) {
      for (const sheet of material.sheets) {
        for (const cut of sheet.cuts) {
          const near = cut.axis === 'x' ? cut.piece.x : cut.piece.y;
          const span = cut.axis === 'x' ? cut.piece.length : cut.piece.width;
          // Strictly inside: a cut at the edge of a piece removes nothing and is not a cut.
          expect(cut.at).toBeGreaterThan(near);
          expect(cut.at).toBeLessThan(near + span);
          expect(cut.stage).toBeGreaterThanOrEqual(1);
        }
        // Numbered in the order they are made, with no gaps.
        expect(sheet.cuts.map((c) => c.sequence)).toEqual(
          sheet.cuts.map((_, i) => i + 1),
        );
      }
    }
  });

  it('writes the same cuts to CSV as it holds in the model', () => {
    const nest = nestProject(sample);
    const rows = cutSequenceCsv(sample, nest).trim().split('\r\n');
    const cuts = nest.byMaterial.flatMap((m) => m.sheets.flatMap((s) => s.cuts));
    expect(rows.length - 1).toBe(cuts.length);
    expect(rows[0]).toContain('Direction');
    // Named for what the operator does, not for the axis.
    expect(rows.some((r) => r.includes('across the length'))).toBe(true);
  });

  it('writes every part to the nest CSV, oversize ones included', () => {
    const rows = nestCsv(sample).trim().split('\r\n');
    expect(rows.length - 1).toBe(87);
  });
});

// ── 4. Kerf ──────────────────────────────────────────────────────────────────────────────

describe('the blade takes material out', () => {
  const twoParts: PackablePart[] = [
    { id: 'a', length: mm(600), width: mm(400), orientations: ['as-cut'] },
    { id: 'b', length: mm(600), width: mm(400), orientations: ['as-cut'] },
  ];
  const usable = usableArea(mm(1200), mm(400), mm(0));

  it('fits two 600s across a 1200 sheet with no blade', () => {
    const result = packSheets(twoParts, { kerf: mm(0), usable });
    expect(result.sheets.length).toBe(1);
    expect(result.sheets[0]!.placements.length).toBe(2);
  });

  it('does not fit them once the blade is 3.2mm wide', () => {
    // 600 + 3.2 + 600 = 1203.2, and there are only 1200.
    const result = packSheets(twoParts, { kerf: mm(3.2), usable });
    expect(result.sheets.length).toBe(2);
  });

  it('leaves exactly the kerf between two parts that share a cut', () => {
    const wider = usableArea(mm(1400), mm(400), mm(0));
    const result = packSheets(twoParts, { kerf: mm(3.2), usable: wider });
    expect(result.sheets.length).toBe(1);
    const [first, second] = [...result.sheets[0]!.placements].sort((a, b) => a.at.x - b.at.x);
    expect(second!.at.x - (first!.at.x + first!.at.length)).toBeCloseTo(3.2, 9);
  });

  it('never ships at zero, because zero is a claim and not a default', () => {
    // Zero kerf is not a conservative default — it is a statement that the saw removes no
    // material, which nests two parts into a space that only holds one.
    expect(DEFAULT_NESTING_SETTINGS.kerf).toBeGreaterThan(0);
    // 6mm: the shipped figures are the **router's**, because that is what this shop cuts nested
    // sheets on. See `DEFAULT_NESTING_SETTINGS` for why, and `post/check.ts` for what goes wrong
    // when a job nested for a saw meets a 6mm cutter.
    expect(DEFAULT_NESTING_SETTINGS.kerf).toBe(6);
    expect(DEFAULT_NESTING_SETTINGS.sheetEdgeTrim).toBe(6);
  });
});

// ── 5. Grain ─────────────────────────────────────────────────────────────────────────────

describe('grain decides which way round a part may go', () => {
  it('lets anything turn on a board with no direction', () => {
    expect(orientationsFor('length-along-grain', 'none')).toEqual(['as-cut', 'turned']);
    expect(orientationsFor('width-along-grain', 'none')).toEqual(['as-cut', 'turned']);
    expect(orientationsFor('any', 'none')).toEqual(['as-cut', 'turned']);
  });

  it('lets a part that does not care turn on any board', () => {
    expect(orientationsFor('any', 'length')).toEqual(['as-cut', 'turned']);
    expect(orientationsFor('any', 'width')).toEqual(['as-cut', 'turned']);
  });

  it('pins a part whose grain already runs the right way', () => {
    expect(orientationsFor('length-along-grain', 'length')).toEqual(['as-cut']);
    expect(orientationsFor('width-along-grain', 'width')).toEqual(['as-cut']);
  });

  /**
   * The two cases that make this a lookup rather than a boolean.
   *
   * A part is not merely *allowed* to turn here — it is **required** to, because its grain runs
   * across it and the board's runs along. A nester that only knows how to decline rotation lays
   * these the wrong way round and passes every test that checks the part fits.
   */
  it('requires a part to turn when its grain runs across the board', () => {
    expect(orientationsFor('width-along-grain', 'length')).toEqual(['turned']);
    expect(orientationsFor('length-along-grain', 'width')).toEqual(['turned']);
  });

  it('never turns a grained part in a real nest', () => {
    const grained: Project = {
      ...sample,
      materials: {
        ...sample.materials,
        sheets: sample.materials.sheets.map((s) =>
          s.id === sample.defaults.doorMaterialId ? { ...s, grain: 'length' as const } : s,
        ),
      },
    };
    const nest = nestProject(grained);
    const doors = nest.byMaterial.find((m) => m.materialId === grained.defaults.doorMaterialId)!;
    const grainedParts = new Set(
      doors.parts.filter((p) => p.grain === 'length-along-grain').map((p) => p.panelId),
    );
    expect(grainedParts.size).toBeGreaterThan(0);
    for (const sheet of doors.sheets) {
      for (const placement of sheet.placements) {
        if (grainedParts.has(placement.partId)) expect(placement.orientation).toBe('as-cut');
      }
    }
    expect(auditNest(nest)).toEqual([]);
  });

  it('reports a part the grain will not let onto a sheet, rather than turning it anyway', () => {
    // 2000 × 1000 fits a 2400 × 1200 sheet as-cut and cannot fit it turned, because turned it is
    // 2000 across a sheet only 1200 wide. So the same part is nestable or not purely by grain.
    const sheetOptions = { kerf: mm(3.2), usable: usableArea(mm(2400), mm(1200), mm(0)) };
    const asCut = packSheets(
      [{ id: 'a', length: mm(2000), width: mm(1000), orientations: ['as-cut'] }],
      sheetOptions,
    );
    const forcedTurn = packSheets(
      [{ id: 'a', length: mm(2000), width: mm(1000), orientations: ['turned'] }],
      sheetOptions,
    );
    expect(asCut.unplaced).toEqual([]);
    expect(forcedTurn.unplaced).toEqual(['a']);
  });
});

// ── 6. Whole sheets on the quote ─────────────────────────────────────────────────────────

describe('board is bought by the sheet', () => {
  it('charges the sample kitchen four carcass sheets and one door sheet', () => {
    const cost = costProject(sample);
    const carcass = cost.byMaterial.find((m) => m.materialId === 'hmr-white-16')!;
    const doors = cost.byMaterial.find((m) => m.materialId === 'poly-classic-white-door-18')!;

    expect(carcass.sheets).toBe(4);
    expect(doors.sheets).toBe(1);
    // 4 × $138.00 and 1 × $168.00, to the cent, GST-registered so the cost base is ex-GST.
    expect(carcass.cost).toBe(4 * 13_800);
    expect(doors.cost).toBe(1 * 16_800);
    expect(cost.sheetCost).toBe(72_000);
    expect(cost.nest.sheetCount).toBe(5);
  });

  it('never charges a fraction of a sheet', () => {
    for (const m of costProject(sample).byMaterial) {
      expect(Number.isInteger(m.sheets)).toBe(true);
      expect(m.boughtM2).toBeCloseTo(m.sheets * SHEET_M2, 9);
    }
  });

  it('shares the board out across the parts so the column adds up to the quote', () => {
    const cost = costProject(sample);
    for (const material of cost.byMaterial) {
      const shares = cost.panels
        .filter((p) => p.materialId === material.materialId)
        .reduce((s, p) => s + p.sheetCost, 0);
      // Exactly, not nearly — the rounding remainder is carried rather than dropped.
      expect(shares).toBe(material.cost);
    }
    expect(cost.panels.reduce((s, p) => s + p.sheetCost, 0)).toBe(cost.sheetCost);
  });

  it('reports the yield it achieved rather than assuming one', () => {
    const carcass = costProject(sample).byMaterial.find((m) => m.materialId === 'hmr-white-16')!;
    // 17.80m² of blanks over 4 sheets of 6.48m². Measured — and, notably, well under the 85% the
    // old allowance assumed for every material on every job.
    expect(carcass.yield).toBeCloseTo(carcass.footprintM2 / (4 * SHEET_M2), 9);
    expect(carcass.yield).toBeLessThan(0.85);
  });

  it('charges an unregistered entity the GST it cannot claim back on the board', () => {
    const personal: Project = {
      ...sample,
      settings: { ...sample.settings, gstMode: 'not-registered' },
    };
    // Same sheets, dearer board: an unregistered entity's cost base is the GST-inclusive price.
    expect(costProject(personal).nest.sheetCount).toBe(costProject(sample).nest.sheetCount);
    expect(costProject(personal).sheetCost).toBe(72_000 * 1.1);
  });
});

// ── 7. Sheet size ────────────────────────────────────────────────────────────────────────

describe('choosing a sheet size', () => {
  it('takes the size that costs least for the material', () => {
    // White HMR comes in 3600×1800 at $138.00 and 2400×1200 at $63.00. Per m² the big sheet is
    // $21.30 and the small one $21.88, and the big one also holds the 3000mm plinth rails, so it
    // wins on both counts.
    const carcass = nestProject(sample).byMaterial.find((m) => m.materialId === 'hmr-white-16')!;
    expect(carcass.sheet.length).toBe(3600);
    expect(carcass.sheet.width).toBe(1800);
  });

  it('will not choose a size that cannot hold every part, however cheap it is', () => {
    // A single 3000mm part on a material whose small sheet is 2400 long. The cheap size is
    // disqualified by the part rather than by its price.
    const project: Project = {
      ...createEmptyProject('One long part'),
      cabinets: [
        createCabinet({
          typeId: 'base',
          name: 'B1',
          width: mm(3000),
          height: mm(720),
          depth: mm(560),
          x: mm(0),
        }),
      ],
    };
    const carcass = nestProject(project).byMaterial.find((m) => m.materialId === 'hmr-white-16')!;
    expect(carcass.sheet.length).toBe(3600);
    expect(carcass.oversize).toEqual([]);
  });
});

// ── 8. Curves nest as their blank ────────────────────────────────────────────────────────

describe('a curved part nests as the blank it is cut from', () => {
  /**
   * §5.1 read the bounding box as a gap waiting for true-shape nesting. For a **saw** it is not
   * one: a guillotine cut runs edge to edge, so the sheet has to hold the rectangle, and the curve
   * is cut from the rectangle afterwards. What the nest has to get right is that the rectangle is
   * measured round the *outside* of the arc — a bowed shelf is deeper at its middle than at its
   * corners, and a nest that read the vertices would reserve a blank the part does not fit.
   */
  const radiused = (options: Partial<CabinetOptions>): Project => ({
    ...createEmptyProject('Radius'),
    cabinets: [
      createCabinet({
        typeId: 'base',
        name: 'R1',
        width: mm(900),
        height: mm(720),
        depth: mm(560),
        x: mm(0),
        options,
      }),
    ],
  });

  it('reserves a skin its developed length, not its chord', () => {
    const project = radiused({ carcassRadius: mm(300), radiusCorner: 'front-right' });
    const skins = buildProject(project)
      .flatMap((b) => b.panels)
      .filter((p) => p.role === 'skin');
    expect(skins.length).toBeGreaterThan(0);

    const nest = nestProject(project);
    for (const skin of skins) {
      const extent = panelExtent(skin);
      const placement = nest.byMaterial
        .flatMap((m) => m.sheets.flatMap((s) => s.placements))
        .find((p) => p.partId === skin.id)!;
      const reserved =
        placement.orientation === 'as-cut'
          ? [placement.at.length, placement.at.width]
          : [placement.at.width, placement.at.length];
      expect(reserved[0]).toBeCloseTo(extent.length, 9);
      expect(reserved[1]).toBeCloseTo(extent.width, 9);
      // A skin round a 300 corner is longer than the corner is wide — that is the whole point.
      expect(extent.length).toBeGreaterThan(300);
    }
    expect(auditNest(nest)).toEqual([]);
  });

  it('reserves a bowed shelf the depth it reaches at its middle', () => {
    // Open radius shelving: the shelf is 274 deep at its ends and bows 40 further at the middle,
    // so the blank is 314 deep. Reading the box off the vertices would reserve 274 and the part
    // would not fit the space it was nested into.
    const project: Project = {
      ...createEmptyProject('Bowed'),
      cabinets: [
        createCabinet({
          typeId: 'wall',
          name: 'S1',
          width: mm(900),
          height: mm(720),
          depth: mm(300),
          x: mm(0),
          options: { doorCount: 0, shelfCount: 2, shelfBow: mm(40) },
        }),
      ],
    };
    const shelves = buildProject(project)
      .flatMap((b) => b.panels)
      .filter((p) => p.role === 'shelf-adjustable' || p.role === 'shelf-fixed');
    const bowed = shelves.filter((s) => panelExtent(s).width > 300);
    expect(bowed.length).toBeGreaterThan(0);

    const nest = nestProject(project);
    for (const shelf of bowed) {
      const extent = panelExtent(shelf);
      expect(extent.width).toBeCloseTo(314, 6);
      const placement = nest.byMaterial
        .flatMap((m) => m.sheets.flatMap((s) => s.placements))
        .find((p) => p.partId === shelf.id)!;
      const reserved = Math.max(placement.at.length, placement.at.width);
      expect(reserved).toBeCloseTo(Math.max(extent.length, extent.width), 9);
    }
    expect(auditNest(nest)).toEqual([]);
  });
});

// ── 9. Migration ─────────────────────────────────────────────────────────────────────────

describe('a v10 job coming forward', () => {
  /** A v10 file: the wastage factor still on it, no nesting settings. */
  const asV10 = (p: Project): Record<string, unknown> => {
    const { nesting, ...settings } = p.settings;
    void nesting;
    return {
      ...p,
      schemaVersion: 10,
      settings: { ...settings, sheetWastageFactor: 0.15 },
    };
  };

  /**
   * Both halves, asserted separately, because they are different promises — and this is the
   * second migration in the file that cannot honour both. See `migrateV10toV11`.
   */
  it('does not move a single part', () => {
    const kitchen = createSampleKitchen();
    const migrated = migrateProject(asV10(kitchen));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    const before = buildProject(kitchen).flatMap((b) => b.panels);
    const after = buildProject(migrated).flatMap((b) => b.panels);
    expect(after.length).toBe(before.length);
    after.forEach((panel, i) => {
      const was = before[i]!;
      expect(panel.name).toBe(was.name);
      expect(panelExtent(panel)).toEqual(panelExtent(was));
      expect(panel.placement).toEqual(was.placement);
      expect(panel.edgeBanding).toEqual(was.edgeBanding);
      expect(panel.features.length).toBe(was.features.length);
    });
  });

  it('does re-price it, upward, by the board it was never being charged for', () => {
    const kitchen = createSampleKitchen();
    const migrated = migrateProject(asV10(kitchen));
    // The old estimate: $593.93 of fractional sheets. The nest: $720.00 of whole ones.
    expect(costProject(migrated).sheetCost).toBe(72_000);
    expect(costProject(migrated).sheetCost).toBeGreaterThan(59_393);
  });

  it('drops the wastage factor, because the number it guessed at is now counted', () => {
    const migrated = migrateProject(asV10(createSampleKitchen()));
    expect('sheetWastageFactor' in migrated.settings).toBe(false);
    expect(migrated.settings.nesting).toEqual(DEFAULT_NESTING_SETTINGS);
  });

  it('migrates shop standards rather than rejecting them', () => {
    const { nesting, ...settings } = AU_SHOP_STANDARDS.settings;
    void nesting;
    const old = {
      ...AU_SHOP_STANDARDS,
      version: 6,
      settings: { ...settings, sheetWastageFactor: 0.2 },
    };
    const migrated = migrateStandards(old);
    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    expect(migrated.settings.nesting).toEqual(DEFAULT_NESTING_SETTINGS);
    expect('sheetWastageFactor' in migrated.settings).toBe(false);
    // Everything a shop actually set is untouched — that is why this is a migration and not a
    // version bump that throws the file away.
    expect(migrated.constructions).toEqual(AU_SHOP_STANDARDS.constructions);
    expect(migrated.defaults).toEqual(AU_SHOP_STANDARDS.defaults);
  });

  it('refuses a v11 file on a build that reads v10', () => {
    expect(() =>
      migrateProject({ ...createSampleKitchen(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
    ).toThrow(/newer version/);
  });
});

// ── 10. The packer itself ────────────────────────────────────────────────────────────────

describe('the packer', () => {
  it('nests the same job the same way every time', () => {
    const a = nestProject(createSampleKitchen());
    resetIdCounter();
    const b = nestProject(createSampleKitchen());
    const layout = (n: ProjectNest) =>
      n.byMaterial.map((m) => m.sheets.map((s) => s.placements.map((p) => rectKey(p.at))));
    expect(layout(b)).toEqual(layout(a));
  });

  it('is at least as good as any single strategy, because it tries them all', () => {
    const parts: PackablePart[] = nestParts(sample)
      .filter((p) => p.materialId === 'hmr-white-16')
      .map((p) => ({
        id: p.panelId,
        length: p.length,
        width: p.width,
        orientations: orientationsFor(p.grain, 'none'),
      }));
    const options = { kerf: mm(3.2), usable: usableArea(mm(3600), mm(1800), mm(0)) };

    const best = packBest(parts, options);
    const oneStrategy = packSheets(parts, options, DEFAULT_STRATEGY);
    expect(best.sheets.length).toBeLessThanOrEqual(oneStrategy.sheets.length);
    expect(best.unplaced).toEqual([]);
  });

  it('says which strategy won, so a layout can be explained', () => {
    const carcass = nestProject(sample).byMaterial.find((m) => m.materialId === 'hmr-white-16')!;
    expect(carcass.strategy.split).toBeDefined();
    expect(carcass.strategy.fit).toBeDefined();
    expect(carcass.strategy.order).toBeDefined();
  });

  it('never reports an offcut that overlaps a part', () => {
    const nest = nestProject(sample);
    for (const material of nest.byMaterial) {
      for (const sheet of material.sheets) {
        for (const offcut of sheet.offcuts) {
          for (const placement of sheet.placements) {
            expect(overlaps(offcut, placement.at)).toBe(false);
          }
        }
      }
    }
  });

  it('only calls an offcut usable when it is big enough to rack', () => {
    const nest = nestProject(sample);
    const min = sample.settings.nesting.usableOffcutMin;
    for (const material of nest.byMaterial) {
      for (const sheet of material.sheets) {
        for (const keeper of usableOffcuts(sheet, min)) {
          expect(Math.min(keeper.length, keeper.width)).toBeGreaterThanOrEqual(min);
        }
      }
    }
  });

  it('handles a job with nothing in it', () => {
    const empty = nestProject(createEmptyProject('Nothing'));
    expect(empty.byMaterial).toEqual([]);
    expect(empty.sheetCount).toBe(0);
    expect(empty.sheetCostExGst).toBe(0);
  });
});

// ── A sanity check on the whole chain ────────────────────────────────────────────────────

describe('the quote and the nest are the same nest', () => {
  it('costs off the nest it carries', () => {
    const cost = costProject(sample);
    const independent = nestProject(sample);
    expect(cost.nest.sheetCount).toBe(independent.sheetCount);
    expect(cost.nest.sheetCostExGst).toBe(independent.sheetCostExGst);
    expect(cost.sheetCost).toBe(cost.nest.sheetCostExGst);
  });

  it('carries a nest warning through onto the quote', () => {
    const project: Project = {
      ...createEmptyProject('Oversize'),
      cabinets: [
        createCabinet({
          typeId: 'custom',
          name: 'Long bench',
          width: mm(4000),
          height: mm(720),
          depth: mm(560),
          x: mm(0),
        }),
      ],
    };
    expect(costProject(project).warnings.some((w) => w.includes('too big'))).toBe(true);
  });
});

/** Reported for reference — not asserted, because how deep a nest cuts is not a promise. */
const stagesOn = (nest: MaterialNest): number =>
  nest.sheets.reduce((d, s) => s.cuts.reduce((c, cut) => Math.max(c, cut.stage), d), 0);

describe('cut depth', () => {
  it('is reported so a shop with a two-stage saw can see it', () => {
    const carcass = nestProject(sample).byMaterial.find((m) => m.materialId === 'hmr-white-16')!;
    expect(stagesOn(carcass)).toBeGreaterThan(0);
  });
});
