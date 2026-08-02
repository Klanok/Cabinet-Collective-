/**
 * Hardware and drawer boxes — Phase 2, Blum first.
 *
 * Reference figures, worked longhand so they can be checked by eye against the Blum sheet and
 * against how a drawer bank actually gets built.
 *
 * ── MERIVOBOX, from the catalogue and the AU planning sheet ────────────────────────────────
 *
 *   nominal lengths        270, 300, 350, 400, 450, 500, 550, 600
 *   M profile              91mm high; wooden back cut at 83mm from 16mm chipboard
 *   drawer bottom          LW − 51 wide  ×  NL − 26 long, 16mm chipboard
 *   minimum inner depth    LT min = NL + 3
 *   runner fixing          37mm from the front edge, then 128mm behind it at NL ≤ 300
 *                          and 256mm behind it at NL 350–600
 *   load rating            40kg
 *
 *   LW is the clear width between the cabinet sides; LT the clear depth in front of the back.
 *
 * ── Reference cabinet: drawer bank 600 × 720 × 560, 16mm carcass, applied 16mm back ────────
 *
 *   LW  = 600 − 2 × 16          = 568
 *   LT  = 560 − 16              = 544
 *   NL  → largest with NL + 3 ≤ 544, so NL ≤ 541, so **NL 500**
 *         (550 would want 553 and does not go in)
 *   bottom = (568 − 51) × (500 − 26)  = **517 × 474**
 *   back   =  568 − 51  ×  83         = **517 × 83**
 *   fixing spacing at NL 500          = **256**
 *
 *   Three equal fronts on a 720 carcass with a 3 top reveal and 3 between:
 *     opening 717, gaps 2 × 3 = 6, so 711 / 3 = 237 each
 *     front bottoms at y = 0, 240, 480
 *
 * ── The vertical chain, off the bottom of the runner ───────────────────────────────────────
 *
 *   bottom of runner  →  underside of the drawer bottom     20
 *   bottom of runner  →  front fixing screw centre          33.5   (+1 if the profile is on first)
 *   first screw       →  second screw                       32
 *   outer face of the cabinet side  →  screw centre         20.5   (Blum's `20.5 + FA`)
 *
 *   The runner itself sits 16 above the bottom edge of its front — a board thickness, from the
 *   bottom drawer sitting on the cabinet floor with its front flush below it. So:
 *     underside of the bottom panel   16 + 20   = **36** above each front's bottom edge
 *     front fixing screws             16 + 33.5 = **49.5** and **81.5**
 *
 * ── Measured board, the whole point of taking LW off the sheet ─────────────────────────────
 *
 *   carcass measured at 16.3:  LW = 600 − 32.6 = 567.4  →  bottom **516.4** × 474
 *   the deduction is the runner's and does not move; the opening is the board's and does
 *
 * ── The sample kitchen's hardware ──────────────────────────────────────────────────────────
 *
 *   3 drawers in D1                       → 3 MERIVOBOX sets, M, NL 500
 *   10 doors × 2 hinges (all 717 tall)    → 20 hinges + 20 plates
 *   7 adjustable shelves × 4              → 28 shelf pins
 *
 *   at the shipped indicative rates:
 *     3 × $52.00 + 20 × $6.40 + 20 × $2.10 + 28 × $0.18
 *       = 156.00 + 128.00 + 42.00 + 5.04  = **$331.04 ex GST**
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mm } from '../src/core/units.ts';
import { createCabinet, createEmptyProject, createSampleKitchen, resetIdCounter } from '../src/core/project/factory.ts';
import type { CabinetOptions } from '../src/core/model/cabinet.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type Project,
  migrateProject,
} from '../src/core/model/project.ts';
import {
  AU_SHOP_STANDARDS,
  CURRENT_STANDARDS_VERSION,
  migrateStandards,
} from '../src/core/standards/standards.ts';
import { buildCabinet, buildProject } from '../src/core/rules/build.ts';
import {
  MERIVOBOX,
  CLIP_TOP_BLUMOTION,
  BLUM_HARDWARE_LIBRARY,
} from '../src/core/library/blum.ts';
import {
  cupCentreFromEdge,
  cupSetbackForSystemGrid,
  drawerBackSize,
  drawerBottomSize,
  hingeCentres,
  hingeCountForHeight,
  largestRunnerFitting,
  minInnerDepthFor,
  plateHolePositions,
  platesOnSystemGrid,
  runnerFixingPositions,
  withProfileFixingPositions,
  unconfirmedHardwareFigures,
} from '../src/core/model/hardware.ts';
import { buildHardwareBom, drillingSummary, hardwareBomTotals } from '../src/core/hardware/bom.ts';
import { costProject } from '../src/core/costing/costing.ts';
import { buildCutlist } from '../src/core/cutlist/cutlist.ts';
import {
  cutlistCsv,
  drillingCsv,
  drillingTotals,
  hardwareCsv,
} from '../src/core/cutlist/export.ts';
import { byName, occupies, size } from './helpers.ts';

let project: Project;

beforeEach(() => {
  resetIdCounter();
  project = createEmptyProject('Hardware');
});

const bank = (options: CabinetOptions = {}, depth = mm(560)) =>
  buildCabinet(
    createCabinet({
      typeId: 'drawer-bank',
      name: 'D',
      width: mm(600),
      depth,
      x: mm(0),
      options: { drawerCount: 3, ...options },
    }),
    project,
  );

describe('the MERIVOBOX spec is data, not arithmetic scattered about', () => {
  it('is made in the lengths Blum makes it in, and no others', () => {
    expect(MERIVOBOX.nominalLengths).toEqual([270, 300, 350, 400, 450, 500, 550, 600]);
    expect(MERIVOBOX.sideHeights.map((h) => [h.code, h.height, h.woodenBackHeight])).toEqual([
      ['N', 68.5, 60.5],
      ['M', 91, 83],
      ['K', 129, 121],
      ['E', 192, 184],
    ]);
    expect(MERIVOBOX.sideHeights.find((h) => h.code === 'N')?.nominalLengths).toEqual([
      400, 450, 500, 550,
    ]);
    expect(MERIVOBOX.sideHeights.find((h) => h.code === 'K')?.nominalLengths).toEqual([
      300, 350, 400, 450, 500, 550, 600,
    ]);
  });

  it('needs three more millimetres of clear depth than its nominal length', () => {
    expect(minInnerDepthFor(MERIVOBOX, mm(500))).toBe(503);
    expect(minInnerDepthFor(MERIVOBOX, mm(270))).toBe(273);
  });

  it('picks the longest runner that fits, and nothing when none does', () => {
    expect(largestRunnerFitting(MERIVOBOX, mm(544))).toBe(500);
    // One millimetre short of what a 550 needs.
    expect(largestRunnerFitting(MERIVOBOX, mm(552))).toBe(500);
    expect(largestRunnerFitting(MERIVOBOX, mm(553))).toBe(550);
    expect(largestRunnerFitting(MERIVOBOX, mm(272))).toBeNull();
  });

it('fixes the cabinet profile at four points, stepping the rear pair at 350', () => {
    /*
     * Off Blum's cabinet profile sheet, and both halves of this replaced a mistake: it used to be
     * one spacing per band — 128 or 256 — applied behind the front fixing, giving **two** holes.
     * Those figures came off the table for the drawer bottom, and the profile takes four screws.
     *
     * Every figure is a distance back from the front edge of the side panel, which is the datum
     * the sheet uses. These are the **system-screw** positions — the sheet gives two options per
     * profile and the chipboard-screw one is a different pattern at the front bracket. Reading
     * across both at once is what made the front pair look ambiguous.
     *
     * The rear pair steps with the length band; the front pair does not.
     */
    expect(runnerFixingPositions(MERIVOBOX, mm(270))).toEqual([37, 69, 160, 192]);
    expect(runnerFixingPositions(MERIVOBOX, mm(350))).toEqual([37, 69, 160, 192]);
    expect(runnerFixingPositions(MERIVOBOX, mm(400))).toEqual([37, 69, 224, 256]);
    expect(runnerFixingPositions(MERIVOBOX, mm(600))).toEqual([37, 69, 224, 256]);
  });

  it('puts four screws in every band, front-most first', () => {
    // A property rather than a repeat of the numbers: whatever a band says, it is four points and
    // they come out in the order somebody works along the panel.
    for (const nl of MERIVOBOX.nominalLengths) {
      const positions = runnerFixingPositions(MERIVOBOX, nl);
      expect(positions, `NL ${nl}`).toHaveLength(4);
      expect([...positions].sort((a, b) => a - b), `NL ${nl}`).toEqual([...positions]);
    }
  });

  it('keeps both pairs 32 apart, which is what fixing with system screws means', () => {
    // Stated as the property rather than as more numbers. It is not a validation of the reading —
    // that lesson has been learned once already — but it is what distinguishes the system-screw
    // pattern from the chipboard one, and it holds at every length.
    for (const nl of MERIVOBOX.nominalLengths) {
      const [first, second, third, fourth] = runnerFixingPositions(MERIVOBOX, nl);
      expect(second! - first!, `NL ${nl} front pair`).toBe(32);
      expect(fourth! - third!, `NL ${nl} rear pair`).toBe(32);
    }
  });

  it('sizes a bottom and a back from the opening and the length', () => {
    expect(drawerBottomSize(MERIVOBOX, mm(568), mm(500))).toEqual({ length: 517, width: 474 });
    expect(drawerBackSize(MERIVOBOX, MERIVOBOX.sideHeights.find((h) => h.code === 'M')!, mm(568))).toEqual({
      length: 517,
      width: 83,
    });
  });

  it('says out loud which of its figures have not been checked', () => {
    const notes = unconfirmedHardwareFigures(BLUM_HARDWARE_LIBRARY);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.join(' ')).toMatch(/runnerAboveCabinetFloor/);
    // `dowelOffset` used to be on this list and is not any more: the INSERTA knock-in drilling
    // pattern settled it at 9.5mm off the cup centreline. A figure that has been checked coming
    // *off* the list is as much the point of this mechanism as one going on it.
    expect(notes.join(' ')).not.toMatch(/dowelOffset/);
  });
});

describe('a drawer box is cut to the runner, not to the cabinet', () => {
  it('cuts a bottom 517 × 474 and a back 517 × 83 on a 600 × 560 bank', () => {
    const { panels, hardware } = bank();
    expect(hardware.runner?.nominalLength).toBe(500);
    expect(hardware.runner?.automatic).toBe(true);
    expect(size(byName(panels, 'Drawer bottom'))).toEqual([517, 474]);
    expect(size(byName(panels, 'Drawer back'))).toEqual([517, 83]);
  });

  it('produces one bottom and one back per drawer, and no more', () => {
    const { panels } = bank({ drawerCount: 4 });
    expect(panels.filter((p) => p.role === 'drawer-bottom')).toHaveLength(4);
    expect(panels.filter((p) => p.role === 'drawer-back')).toHaveLength(4);
  });

  it('bands nothing — every edge of a box part is captured', () => {
    const { panels } = bank();
    for (const name of ['Drawer bottom', 'Drawer back']) {
      expect(byName(panels, name).edgeBanding).toEqual({});
    }
  });

  /**
   * Blum dimensions a box off **the bottom of the runner**: the underside of the bottom panel is 20
   * above it. The runner in turn sits a board thickness above the bottom edge of its front, which is
   * where the bottom drawer lands when it sits on the cabinet floor with its front flush below.
   * So 16 + 20 = 36 above each front's bottom edge.
   */
  it('stacks the boxes off the bottom of the runner, not off a made-up offset', () => {
    const { panels } = bank();
    const undersides = panels
      .filter((p) => p.role === 'drawer-bottom')
      .map((p) => occupies(p, project).y[0]);
    // Fronts sit at 0, 240 and 480.
    expect(undersides).toEqual([36, 276, 516]);
  });

  it('centres the box in the opening — the runner takes the same bite off each side', () => {
    const { panels } = bank();
    // Opening runs x ∈ [16, 584]; a 517 bottom centred in 568 leaves 25.5 each side.
    expect(occupies(byName(panels, 'Drawer bottom'), project).x).toEqual([41.5, 558.5]);
  });

  /**
   * The deduction belongs to the runner and the opening belongs to the board. Measure the carcass
   * at 16.3 and the bottom follows, because that is the gap the box has to go into.
   */
  it('follows the board a job is really cut from, not the board it is called', () => {
    const measured: Project = {
      ...project,
      materials: {
        ...project.materials,
        sheets: project.materials.sheets.map((s) =>
          s.id === 'hmr-white-16' ? { ...s, actualThickness: mm(16.3) } : s,
        ),
      },
    };
    const built = buildCabinet(
      createCabinet({
        typeId: 'drawer-bank',
        name: 'D',
        width: mm(600),
        x: mm(0),
        options: { drawerCount: 3 },
      }),
      measured,
    );
    // LW = 600 − 32.6 = 567.4, so the bottom is 516.4. The length off the runner does not move.
    expect(size(byName(built.panels, 'Drawer bottom'))).toEqual([516.4, 474]);
  });
});

describe('a runner that cannot go in', () => {
  it('cuts no boxes on a carcass too shallow for the shortest runner, and says why', () => {
    const built = bank({ drawerCount: 2 }, mm(200));
    expect(built.hardware.runner).toBeNull();
    expect(built.panels.filter((p) => p.role === 'drawer-bottom')).toHaveLength(0);
    // The fronts still come out, so it still reads as a drawer bank while it is being fixed.
    expect(built.panels.filter((p) => p.role === 'drawer-front')).toHaveLength(2);
    expect(built.warnings.join(' ')).toMatch(/not enough for any MERIVOBOX runner/);
    expect(built.warnings.join(' ')).toMatch(/shortest is 270mm and needs 273mm/);
  });

  it('refuses a length Blum does not make rather than rounding to the nearest', () => {
    const built = bank({ drawerNominalLength: mm(512) });
    expect(built.hardware.runner).toBeNull();
    expect(built.warnings.join(' ')).toMatch(/not made at 512mm/);
    expect(built.warnings.join(' ')).toMatch(/270, 300, 350, 400, 450, 500, 550, 600/);
  });

  it('refuses a length the cabinet will not hold, naming both figures', () => {
    const built = bank({ drawerNominalLength: mm(600) });
    expect(built.hardware.runner).toBeNull();
    expect(built.warnings.join(' ')).toMatch(/needs 603mm of clear depth and this cabinet has 544mm/);
  });

  it('honours a length that is shorter than the deepest one that fits', () => {
    const built = bank({ drawerNominalLength: mm(450) });
    expect(built.hardware.runner?.nominalLength).toBe(450);
    expect(built.hardware.runner?.automatic).toBe(false);
    expect(size(byName(built.panels, 'Drawer bottom'))).toEqual([517, 424]);
  });

  it('does not pair an N-height side with a length Blum does not make it in', () => {
    const automatic = bank({ drawerSideHeightCode: 'N' }, mm(660));
    expect(automatic.hardware.runner?.nominalLength).toBe(550);
    expect(size(byName(automatic.panels, 'Drawer back'))).toEqual([517, 60.5]);

    const asked = bank({ drawerSideHeightCode: 'N', drawerNominalLength: mm(600) }, mm(660));
    expect(asked.hardware.runner).toBeNull();
    expect(asked.warnings.join(' ')).toMatch(/400, 450, 500, 550mm at height N/);
  });

  it('cuts the verified K-height wooden back', () => {
    const built = bank({ drawerSideHeightCode: 'K' });
    expect(built.hardware.sideHeight.height).toBe(129);
    expect(size(byName(built.panels, 'Drawer back'))).toEqual([517, 121]);
  });

  it('never throws, whatever depth is typed on the way to a real one', () => {
    // A number field fires on every keystroke: typing "560" resolves 5, then 56, then 560. The
    // lesson §4.5 paid for, applied here before it costs anything.
    for (const depth of [1, 5, 20, 56, 200, 300, 560, 2000]) {
      expect(() => bank({ drawerCount: 3 }, mm(depth))).not.toThrow();
    }
  });

  it('falls back to a shipped system when a job points at one that has been deleted', () => {
    const built = bank({ runnerSystemId: 'nothing-like-this' });
    expect(built.hardware.runnerSystem.id).toBe(MERIVOBOX.id);
    expect(built.warnings.join(' ')).toMatch(/is not in this job/);
  });
});

describe('the hinge system', () => {
  it('centres the cup 22.5mm in from the door edge on a 5mm drilling distance', () => {
    // Blum states the distance to the near edge of the bore. The centre is derived, so the two
    // cannot disagree: 5 + 35/2.
    expect(cupCentreFromEdge(CLIP_TOP_BLUMOTION)).toBe(22.5);
  });

  it('counts hinges by door height, and keeps counting above the last band', () => {
    const h = CLIP_TOP_BLUMOTION;
    expect(hingeCountForHeight(h, mm(400))).toBe(2);
    expect(hingeCountForHeight(h, mm(900))).toBe(2);
    expect(hingeCountForHeight(h, mm(901))).toBe(3);
    expect(hingeCountForHeight(h, mm(1600))).toBe(3);
    expect(hingeCountForHeight(h, mm(2000))).toBe(4);
    // A 2067 tall door is not a 2000 door: 4 + one per 400mm above.
    expect(hingeCountForHeight(h, mm(2067))).toBe(5);
    expect(hingeCountForHeight(h, mm(2400))).toBe(5);
    expect(hingeCountForHeight(h, mm(2401))).toBe(6);
  });

  it('sets the end hinges at the setback and spreads the rest evenly between them', () => {
    const h = CLIP_TOP_BLUMOTION;
    expect(hingeCentres(h, mm(717), 2)).toEqual([96, 621]);
    // 2067 tall, five hinges: 96 to 1971 is 1875, in four steps of 468.75.
    expect(hingeCentres(h, mm(2067), 5)).toEqual([96, 564.75, 1033.5, 1502.25, 1971]);
  });

  it('puts one hinge in the middle of a door too short for two at the setback', () => {
    // 150 tall cannot take hinges 96 from each end; two would be on top of each other.
    expect(hingeCentres(CLIP_TOP_BLUMOTION, mm(150), 2)).toEqual([75]);
  });

  /**
   * Whether the plate screws land on the system grid decides whether one line-boring pass covers
   * the shelf pins and the hinge plates together. On the shipped 96mm setback they do not — 80 and
   * 112 are not multiples of 32 — and the function says which setback would.
   */
  it('reports whether the plate screws fall on the 32mm grid, and what would put them there', () => {
    const h = CLIP_TOP_BLUMOTION;
    expect(plateHolePositions(h, mm(0))).toEqual([80, 112]);
    expect(platesOnSystemGrid(h, mm(32), mm(0))).toBe(false);
    // 112 − 16 = 96 and 112 + 16 = 128: both on the grid.
    expect(cupSetbackForSystemGrid(h, mm(32), mm(0))).toBe(112);
    expect(platesOnSystemGrid({ ...h, cupEndSetback: mm(112) }, mm(32), mm(0))).toBe(true);
  });
});

describe('the hardware BOM', () => {
  let kitchen: Project;
  beforeEach(() => {
    resetIdCounter();
    kitchen = createSampleKitchen();
  });

  it('orders three MERIVOBOX sets, twenty-two hinges and plates, and thirty-two pins', () => {
    const bom = buildHardwareBom(kitchen);
    const qty = (match: RegExp) => bom.find((l) => match.test(l.name))?.quantity;

    expect(qty(/MERIVOBOX drawer set/)).toBe(3);
    expect(qty(/^Blum CLIP top/)).toBe(22);
    expect(qty(/mounting plate/)).toBe(22);
    expect(qty(/Shelf pin/)).toBe(32);
    expect(bom.find((l) => /MERIVOBOX/.test(l.name))?.name).toMatch(/NL 500/);
  });

  it('adds up to $348.76 ex GST on the shipped indicative rates', () => {
    const totals = hardwareBomTotals(buildHardwareBom(kitchen));
    expect(totals.totalExGst).toBe(34_876);
    expect(totals.pieceCount).toBe(79);
    expect(totals.indicativePricing).toBe(true);
  });

  /**
   * Counted from the features actually emitted, not from the cabinet's options. A door the rule
   * engine could not bore must not appear on a hardware order.
   */
  it('does not order a hinge for a door that could not be bored', () => {
    // A 40mm-wide door leaves nowhere for a 35mm cup 22.5mm in from the edge.
    const narrow = buildCabinet(
      createCabinet({
        typeId: 'custom',
        name: 'C',
        width: mm(44),
        x: mm(0),
        options: { doorCount: 1, shelfCount: 0, hasBack: false, topStyle: 'open' },
      }),
      project,
    );
    expect(narrow.warnings.join(' ')).toMatch(/leaves nowhere for a 35mm cup/);
    const bom = buildHardwareBom({ ...project, cabinets: [narrow.cabinet] });
    expect(bom.filter((l) => l.category === 'hinge')).toHaveLength(0);
  });

  it('does not order a drawer set for a bank that got no boxes', () => {
    const shallow = bank({ drawerCount: 2 }, mm(200));
    const bom = buildHardwareBom({ ...project, cabinets: [shallow.cabinet] });
    expect(bom.filter((l) => l.category === 'drawer-set')).toHaveLength(0);
  });

  it('groups the same hardware across cabinets onto one line', () => {
    const bom = buildHardwareBom(kitchen);
    const hinges = bom.filter((l) => l.category === 'hinge');
    expect(hinges).toHaveLength(1);
    // Seven cabinets have doors. D1 has drawers, and the dishwasher space has nothing at all.
    expect(hinges[0]!.cabinetNames).toHaveLength(7);
  });
});

describe('hardware on the quote', () => {
  let kitchen: Project;
  beforeEach(() => {
    resetIdCounter();
    kitchen = createSampleKitchen();
  });

  it('is its own line, inside material cost, and inside the total', () => {
    const c = costProject(kitchen);
    expect(c.hardwareCost).toBe(34_876);
    expect(c.materialCost).toBe(
      c.sheetCost + c.edgeBandCost + c.hardwareCost + c.benchtopCost,
    );
    expect(c.totalCost).toBe(c.materialCost + c.labourCost + c.machiningCost + c.installCost);
  });

  /**
   * An unregistered entity cannot claim the GST back on a box of hinges any more than on a sheet,
   * so its cost base is GST-inclusive. Getting this backwards understates the hardware by 10%.
   */
  it('picks up unclaimable GST for an unregistered entity', () => {
    const unregistered = costProject({
      ...kitchen,
      settings: { ...kitchen.settings, gstMode: 'not-registered' },
    });
    expect(unregistered.hardwareCost).toBe(Math.round(34_876 * 1.1));
  });

  it('keeps a quote flagged as indicative while the Blum prices are placeholders', () => {
    expect(costProject(kitchen).usesIndicativePricing).toBe(true);
  });
});

describe('the drilling summary', () => {
  it('groups the sample kitchen by bore and says which face each goes in', () => {
    const kitchen = createSampleKitchen();
    const groups = drillingSummary(kitchen);
    const find = (d: number) => groups.find((g) => g.diameter === d)!;

    // 22 hinge cups, and two dowels each — both in the back of the door.
    expect(find(35).count).toBe(22);
    expect(find(35).face).toBe('B');
    expect(find(8).count).toBe(44);
    expect(find(8).face).toBe('B');

    /*
     * The Ø5 holes, longhand:
     *   hinge plates   22 hinges × 2                              =  44
     *   runners         3 drawers × 2 sides × 4 fixings           =  24
     *   shelf pins      5 cabinets with adjustable shelves
     *                     × 2 sides × 2 rows × 17 holes           = 340
     *                                                              ───
     *                                                               408
     *
     * The shelf-pin figure was 21 a row while the row ran the full height of the side. It is 17
     * now that the run keeps 96mm clear of each end and is centred so a flipped panel lines up —
     * every cabinet in this kitchen is 720 high, so every row is the same 17.
     */
    expect(find(5).count).toBe(408);
    expect(find(5).face).toBe('A');

    // The front fixing pilots: 3 drawers x 2 brackets x 2 screws, in the back of each front.
    expect(find(3).count).toBe(12);
    expect(find(3).face).toBe('B');
  });

  /**
   * The number that was wrong, and the one the shop caught.
   *
   * A hole being in the back of a part is not a flip. The face being machined is the face that goes
   * up on the bed — so a plain door with hinge cups in its back and nothing on its show face is bored
   * back-up in **one** setup. On a plain-slab kitchen **nothing turns over at all**; it was reporting
   * 72 of them.
   */
  it('turns nothing over on a plain-slab kitchen, and every front on a shaker one', () => {
    const slab = createSampleKitchen();
    const plain = drillingTotals(buildProject(slab).flatMap((b) => b.panels));
    // 554 while the shelf-pin rows ran the full height; 474 once each row became 17 holes rather
    // than 21 — 20 rows × 4 fewer. Then 486, once the cabinet profile went from two fixings a side
    // to the four Blum's sheet actually shows: 3 drawers × 2 sides × 2 more.
    expect(plain.holes).toBe(486);
    expect(plain.turnedParts).toBe(0);

    // A shaker front is recessed on its show face *and* bored in its back: two setups, honestly.
    const shaker: Project = { ...slab, defaults: { ...slab.defaults, doorStyleId: 'shaker-57' } };
    const routed = drillingTotals(buildProject(shaker).flatMap((b) => b.panels));
    expect(routed.holes).toBe(486);
    // Eleven doors and three drawer fronts, all routed and all bored.
    expect(routed.turnedParts).toBe(14);
  });
});

describe('export', () => {
  let kitchen: Project;
  beforeEach(() => {
    resetIdCounter();
    kitchen = createSampleKitchen();
  });

  it('writes a cutlist CSV with one row per line and a header', () => {
    const rows = cutlistCsv(kitchen).trimEnd().split('\r\n');
    expect(rows[0]).toBe(
      'Qty,Part,Material,Thickness,Length,Width,Banding,Banded mm,Grain,For,Note',
    );
    expect(rows).toHaveLength(buildCutlist(kitchen).length + 1);
    expect(rows.join('\n')).toMatch(/^3,Drawer bottom,/m);
  });

  it('writes a hardware CSV a supplier could work from', () => {
    const rows = hardwareCsv(kitchen).trimEnd().split('\r\n');
    expect(rows).toHaveLength(buildHardwareBom(kitchen).length + 1);
    expect(rows.join('\n')).toMatch(/MERIVOBOX drawer set/);
    // Prices as dollars with two places — this goes to a person, not back into the model.
    expect(rows.join('\n')).toMatch(/,52\.00,156\.00,/);
  });

  it('writes one row per hole on the drilling sheet, rows of system holes expanded', () => {
    const rows = drillingCsv(kitchen).trimEnd().split('\r\n');
    // 408 + 22 + 44 + 12 = 486 holes, plus the header.
    expect(rows).toHaveLength(487);
    expect(rows[0]).toBe('Cabinet,Part,Purpose,Face,Turns over,X,Y,Diameter,Depth,Feature');
    // The cups, their dowels and the front fixings all go in the back of a front — but on a
    // plain-slab kitchen no part is machined on both faces, so nothing turns over.
    expect(rows.filter((r) => r.includes(',B,'))).toHaveLength(78);
    expect(rows.filter((r) => r.includes(',yes,'))).toHaveLength(0);
  });

  it('quotes a field containing a comma rather than shifting every column after it', () => {
    const comma: Project = {
      ...kitchen,
      cabinets: [{ ...kitchen.cabinets[0]!, name: 'B1, sink' }],
    };
    expect(cutlistCsv(comma)).toMatch(/"B1, sink"/);
  });
});

/**
 * The v8 → v9 migration, and it is the one that does not claim to change nothing.
 *
 * Every other migration in this codebase was written so a saved job cuts and prices exactly as it
 * did. This one keeps the first half of that promise and deliberately breaks the second, so both
 * halves get asserted separately rather than being run together into "it still works".
 */
describe('an older job coming forward', () => {
  /** A job saved before hardware existed. */
  const asV8 = (p: Project): Record<string, unknown> => {
    const { hardware, defaults, constructions, ...rest } = p;
    void hardware;
    const { runnerSystemId, drawerSideHeightCode, hingeSystemId, ...restDefaults } = defaults;
    void runnerSystemId;
    void drawerSideHeightCode;
    void hingeSystemId;
    return {
      ...rest,
      schemaVersion: 8,
      defaults: restDefaults,
      constructions: constructions.map((c) => {
        const { systemBackSetback, systemHoleDiameter, systemHoleDepth, ...restC } = c;
        void systemBackSetback;
        void systemHoleDiameter;
        void systemHoleDepth;
        return restC;
      }),
    };
  };

  let kitchen: Project;
  beforeEach(() => {
    resetIdCounter();
    kitchen = createSampleKitchen();
  });

  it('gives it the shipped Blum library and points its defaults at MERIVOBOX', () => {
    const migrated = migrateProject(asV8(kitchen));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.defaults.runnerSystemId).toBe('merivobox');
    expect(migrated.defaults.drawerSideHeightCode).toBe('M');
    expect(migrated.defaults.hingeSystemId).toBe('clip-top-blumotion');
    expect(migrated.hardware.runnerSystems.map((s) => s.id)).toEqual(['merivobox']);
  });

  it('fills in the system-hole figures without touching a shop’s own front setback', () => {
    const moved = { ...asV8(kitchen) } as Record<string, unknown>;
    moved.constructions = (moved.constructions as Record<string, unknown>[]).map((c) => ({
      ...c,
      systemFrontSetback: 40,
    }));
    const migrated = migrateProject(moved);
    const c = migrated.constructions[0]!;
    expect(c.systemFrontSetback).toBe(40);
    // The rear line follows the front one, not the shipped 37 — a shop that moved one meant both.
    expect(c.systemBackSetback).toBe(40);
    expect(c.systemHoleDiameter).toBe(5);
    expect(c.systemHoleDepth).toBe(13);
  });

  /** The half of the rule that is kept, and it is the half that protects a job on the saw. */
  it('moves no part that already existed', () => {
    const migrated = migrateProject(asV8(kitchen));
    const before = buildCutlist(kitchen).filter(
      (l) => l.name !== 'Drawer bottom' && l.name !== 'Drawer back',
    );
    const after = buildCutlist(migrated).filter(
      (l) => l.name !== 'Drawer bottom' && l.name !== 'Drawer back',
    );
    expect(after).toEqual(before);
  });

  /**
   * The half that is deliberately broken, stated as an assertion so nobody has to wonder whether it
   * was an accident. A saved kitchen gets dearer because it always had hinges and runners in it and
   * was never being charged for them.
   */
  it('does re-price it, upward, by the hardware it always needed', () => {
    const migrated = migrateProject(asV8(kitchen));
    const cost = costProject(migrated);
    expect(cost.hardwareCost).toBe(34_876);
    expect(cost.totalIncGst).toBeGreaterThan(0);
  });

  it('refuses a job saved by a newer build rather than quoting the hardware at zero', () => {
    expect(() => migrateProject({ ...asV8(kitchen), schemaVersion: 99 })).toThrow(/newer version/);
  });

  it('carries a shop’s standards forward rather than replacing them', () => {
    const { hardware, defaults, ...rest } = AU_SHOP_STANDARDS;
    void hardware;
    const { runnerSystemId, drawerSideHeightCode, hingeSystemId, ...restDefaults } = defaults;
    void runnerSystemId;
    void drawerSideHeightCode;
    void hingeSystemId;
    const v4 = { ...rest, version: 4, defaults: restDefaults, savedTypes: [] };

    const migrated = migrateStandards(v4);
    expect(migrated.version).toBe(CURRENT_STANDARDS_VERSION);
    expect(migrated.defaults.runnerSystemId).toBe('merivobox');
    expect(migrated.hardware.hingeSystems.map((s) => s.id)).toEqual(['clip-top-blumotion']);
    // Kick height, reveals and shelf clearances all untouched.
    expect(migrated.constructions[0]!.kickHeight).toBe(AU_SHOP_STANDARDS.constructions[0]!.kickHeight);
  });

  it('keeps a shop’s edited hardware rather than overwriting it with the shipped library', () => {
    const mine = {
      ...BLUM_HARDWARE_LIBRARY,
      hingeSystems: [{ ...CLIP_TOP_BLUMOTION, cupEndSetback: mm(112) }],
    };
    const migrated = migrateProject({ ...asV8(kitchen), hardware: mine });
    expect(migrated.hardware.hingeSystems[0]!.cupEndSetback).toBe(112);
  });

  it('adds verified MERIVOBOX heights to an existing job without changing its selection', () => {
    const oldMerivobox = {
      ...MERIVOBOX,
      sideHeights: MERIVOBOX.sideHeights.filter((height) => height.code === 'M'),
    };
    const migrated = migrateProject({
      ...kitchen,
      schemaVersion: 16,
      hardware: { ...kitchen.hardware, runnerSystems: [oldMerivobox] },
      defaults: { ...kitchen.defaults, drawerSideHeightCode: 'M' },
    });

    expect(migrated.hardware.runnerSystems[0]!.sideHeights.map((height) => height.code)).toEqual([
      'N',
      'M',
      'K',
      'E',
    ]);
    expect(migrated.defaults.drawerSideHeightCode).toBe('M');
  });

  it('adds the same heights to saved shop standards for future jobs', () => {
    const oldMerivobox = {
      ...MERIVOBOX,
      sideHeights: MERIVOBOX.sideHeights.filter((height) => height.code === 'M'),
    };
    const migrated = migrateStandards({
      ...AU_SHOP_STANDARDS,
      version: 12,
      hardware: { ...AU_SHOP_STANDARDS.hardware, runnerSystems: [oldMerivobox] },
      defaults: { ...AU_SHOP_STANDARDS.defaults, skinMaterialId: 'bendy-ply-3' },
    });

    expect(migrated.hardware.runnerSystems[0]!.sideHeights.map((height) => height.code)).toEqual([
      'N',
      'M',
      'K',
      'E',
    ]);
    expect(migrated.defaults.skinMaterialId).toBe('bendy-ply-8');
  });
});

describe('nothing that existed before Phase 2 has moved', () => {
  it('keeps every pre-Phase-2 part at exactly the size and place it had', () => {
    const kitchen = createSampleKitchen();
    const panels = buildProject(kitchen).flatMap((b) => b.panels);
    const old = panels.filter((p) => p.role !== 'drawer-bottom' && p.role !== 'drawer-back');

    /*
     * 67 rather than the Phase 1 gate's 63, and none of the difference is a part that moved: the
     * sample kitchen has since gained a dishwasher space (no parts) and an end base (+8), and the
     * ladder base has taken over the four per-cabinet kick panels (−4). Every size below is the
     * size it was in Phase 1, which is what this test is actually for.
     */
    expect(old).toHaveLength(67);
    expect(size(byName(old, 'Door L'))).toEqual([717, 447]);
    expect(size(byName(old, 'Bottom'))).toEqual([868, 544]);
    expect(size(byName(old, 'Side L'))).toEqual([720, 544]);
    expect(size(byName(old, 'Drawer front 1'))).toEqual([597, 237]);
    // Banding is unchanged: hardware adds machining, never an edge.
    expect(byName(old, 'Door L').edgeBanding).toEqual({
      L1: 'eb-white-1mm',
      L2: 'eb-white-1mm',
      W1: 'eb-white-1mm',
      W2: 'eb-white-1mm',
    });
  });

  it('builds the sample kitchen with no warnings, hardware and all', () => {
    expect(buildProject(createSampleKitchen()).flatMap((b) => b.warnings)).toEqual([]);
  });
});

describe('a job saved while the profile had two fixings', () => {
  /**
   * The old stored shape: one spacing per length band, applied behind the front fixing.
   *
   * Worth reconstructing by hand rather than reaching for a fixture, because the point of the test
   * is that a file written by the *old* build loads — and the old build is gone.
   */
  const asV14 = (): Record<string, unknown> => {
    const stored = JSON.parse(JSON.stringify(createSampleKitchen())) as Record<string, unknown>;
    stored.schemaVersion = 14;
    const hardware = stored.hardware as Record<string, unknown>;
    hardware.runnerSystems = (hardware.runnerSystems as Record<string, unknown>[]).map((sys) => {
      const { fixingPositions, ...rest } = sys;
      void fixingPositions;
      return {
        ...rest,
        fixingSpacings: [
          { maxNominalLength: 300, spacing: 128 },
          { maxNominalLength: 600, spacing: 256 },
        ],
      };
    });
    return stored;
  };

  it('replaces the shipped system’s figures with the sheet’s, rather than carrying them forward', () => {
    /*
     * The one case where a migration *should* overwrite. The old figures came off the table for
     * the drawer bottom and produced two holes where the profile takes four — the shop said so.
     * Carrying them forward faithfully would be preserving a known error.
     */
    const migrated = migrateProject(asV14());
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const merivobox = migrated.hardware.runnerSystems.find((r) => r.id === MERIVOBOX.id)!;
    expect(merivobox.fixingPositions).toEqual(MERIVOBOX.fixingPositions);
    expect(runnerFixingPositions(merivobox, mm(500))).toEqual([37, 69, 224, 256]);
  });

  it('leaves a shop’s own runner system alone, restated in the new shape', () => {
    // No sheet for their runner and no business giving it Blum's pattern: what they had was one
    // spacing behind the front fixing, so that is exactly the two positions it comes forward as.
    const own = withProfileFixingPositions(
      {
        id: 'shop-special',
        frontFixingSetback: 40,
        fixingSpacings: [{ maxNominalLength: 600, spacing: 200 }],
      },
      [MERIVOBOX],
    );
    expect(own.fixingPositions).toEqual([{ maxNominalLength: 600, positions: [40, 240] }]);
    expect(own.fixingSpacings).toBeUndefined();
  });

  it('leaves a library that has already been migrated untouched', () => {
    const already = { id: MERIVOBOX.id, fixingPositions: [{ maxNominalLength: 600, positions: [1] }] };
    expect(withProfileFixingPositions(already, [MERIVOBOX])).toBe(already);
  });

  it('moves drilling and nothing else — every cut size is unchanged', () => {
    // The honesty contract. This migration does move holes, and says so; what it must not do is
    // change a part.
    const migrated = migrateProject(asV14());
    const fresh = createSampleKitchen();
    const strip = (lines: ReturnType<typeof buildCutlist>) =>
      lines.map(({ ...line }) => ({ ...line, ids: undefined }));
    expect(strip(buildCutlist(migrated))).toEqual(strip(buildCutlist(fresh)));
  });
});
